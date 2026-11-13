"""Serve uploaded files at /uploads/<key> — from the local volume or, if not
there, from the (private) S3 bucket.

The bucket never needs public access: the website proxies /uploads/* here
(web/src/app/uploads/[...path]), and S3 objects are streamed through the API.
Set S3_PUBLIC_BASE_URL=https://<site>/uploads so new S3 uploads get URLs on
the site's own domain. `private/…` (job-application CVs) is never served here.
"""
from __future__ import annotations

import mimetypes
import re

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse

from api import storage
from api.config import get_settings

router = APIRouter(tags=["files"])

_SAFE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-./]{0,400}$")


@router.get("/uploads/{key:path}", include_in_schema=False)
def serve_upload(key: str):
    if not _SAFE.match(key) or ".." in key.split("/") or key.startswith("private/"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    root = storage.local_upload_root().resolve()
    local = (root / key).resolve()
    if root in local.parents and local.is_file():
        return FileResponse(local, headers={"Cache-Control": "public, max-age=86400"})
    s = get_settings()
    if not s.s3_bucket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    try:
        obj = storage._client().get_object(Bucket=s.s3_bucket, Key=key)
    except Exception:  # noqa: BLE001 — missing key / denied → 404, never leak details
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    ctype = obj.get("ContentType") or mimetypes.guess_type(key)[0] or "application/octet-stream"
    return StreamingResponse(
        obj["Body"].iter_chunks(64 * 1024),
        media_type=ctype,
        headers={"Cache-Control": "public, max-age=86400", "Content-Length": str(obj.get("ContentLength", ""))} if obj.get("ContentLength") else {"Cache-Control": "public, max-age=86400"},
    )
