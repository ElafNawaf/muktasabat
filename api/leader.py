"""Run background jobs in one container only.

With several API containers (autoscaling), each would start the hourly payment
alerts, the HR monitor and the approval escalations. A Postgres session-level
advisory lock elects one leader: the container that holds the lock runs the
jobs; the others retry every minute and take over if the leader goes away
(its connection closes and Postgres releases the lock). SQLite → always leader.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable

from api.database import engine

log = logging.getLogger("api.leader")
LOCK_ID = 727_001  # arbitrary, constant for this app


async def run_as_leader(jobs: list[Callable[[], Awaitable[None]]], retry_seconds: int = 60) -> None:
    if os.environ.get("BACKGROUND_JOBS", "1").lower() in ("0", "false", "no", "off"):
        log.info("background jobs: disabled (BACKGROUND_JOBS=0)")
        return
    if engine.dialect.name != "postgresql":
        await asyncio.gather(*(j() for j in jobs))
        return
    while True:
        conn = None
        tasks: list[asyncio.Task] = []
        try:
            conn = await asyncio.to_thread(engine.raw_connection)
            cur = conn.cursor()
            cur.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_ID,))
            got = bool(cur.fetchone()[0])
            conn.commit()
            if got:
                log.info("background jobs: this container is the leader")
                tasks = [asyncio.create_task(j()) for j in jobs]
                while True:  # keep the lock's connection alive; lose it → stop and retry
                    await asyncio.sleep(retry_seconds)
                    def _ping() -> None:
                        c = conn.cursor()
                        c.execute("SELECT 1")
                        c.fetchone()
                        conn.commit()
                    await asyncio.to_thread(_ping)
        except asyncio.CancelledError:
            for t in tasks:
                t.cancel()
            raise
        except Exception:  # noqa: BLE001
            log.warning("background jobs: leader connection lost, retrying", exc_info=True)
        finally:
            for t in tasks:
                t.cancel()
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass
        await asyncio.sleep(retry_seconds)
