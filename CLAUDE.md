# Muktasabat (PropOS)

## Stack (repo root)

- **API**: Python **FastAPI** + SQLAlchemy 2 (`api/`) — served with **Uvicorn**
- **Web**: **Next.js 14** (`web/`)
- **Database**: **PostgreSQL** (Docker) or **SQLite** for quick local API runs

The legacy **Flask** UI was removed; this tree is **FastAPI + Next.js** only.

## Local development

From the repository root:

```bash
cd web && npm install
```

**Terminal 1 — FastAPI** (Postgres example; or omit `DATABASE_URL` to use default SQLite `sqlite:///./muktasbat.db`)

```bash
cd /path/to/muktasabat
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DATABASE_URL=postgresql://muktasbat:muktasbat_secret@127.0.0.1:5432/muktasbat \
  .venv/bin/uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

Start Postgres only: `docker compose up -d db`

**Terminal 2 — Next.js** (point at your API)

```bash
cd web && API_URL=http://127.0.0.1:8000 npm run dev
```

Open **http://localhost:3000**

## Docker — full stack (Postgres + FastAPI + Next.js)

```bash
docker compose up --build
```

- Next.js: **http://localhost:3000**
- FastAPI docs: **http://localhost:8000/api/docs**

## Key paths

- `api/` — FastAPI application
- `web/` — Next.js application
- `docker-compose.yml` — `db`, `api`, `web`
- `Dockerfile` — API image
- Architecture: `PropOS_Architecture_Diagram.html`

## Rules

- Never commit `.env` or production secrets.
- `SECRET_KEY` must be set for JWT signing in non-dev environments.
