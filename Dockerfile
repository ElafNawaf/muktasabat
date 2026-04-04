FROM python:3.13-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Compile translations
RUN pybabel compile -d app/translations

RUN adduser --disabled-password --gecos '' appuser
USER appuser

EXPOSE 5000

CMD ["sh", "-c", "flask db upgrade && python scripts/seed.py && gunicorn -c gunicorn.conf.py wsgi:app"]
