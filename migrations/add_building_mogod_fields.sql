-- Migration: Add Mogod building fields to the buildings table
-- Idempotent: every statement uses IF NOT EXISTS so re-running is a no-op.
--
-- PostgreSQL:  psql $DATABASE_URL -f migrations/add_building_mogod_fields.sql
-- SQLite:      sqlite3 muktasbat.db < migrations/add_building_mogod_fields.sql

-- ── General information (معلومات عامة) ──────────────────────────────────────
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS contract_type        VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS building_code        VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS water_meter_number   VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS electricity_meter_number VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS lease_contract_number VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS branch               VARCHAR(100);

-- ── Location (الموقع) ────────────────────────────────────────────────────────
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS street               VARCHAR(200);

-- ── Deed information (معلومات الصك) ─────────────────────────────────────────
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS deed_number          VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS deed_document_type   VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS deed_date            DATE;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS deed_document_number VARCHAR(50);

-- ── Property data (بيانات العقار) ────────────────────────────────────────────
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS property_type        VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS residence_type       VARCHAR(50);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS offices_count        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS commercial_shops_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS apartments_count     INTEGER NOT NULL DEFAULT 0;

-- Index on building_code for fast look-up
CREATE INDEX IF NOT EXISTS ix_buildings_building_code ON buildings (building_code);

-- ── New table: building_documents (ملفات العقار) ─────────────────────────────
-- Note: master also has building_images (S3 photos). building_documents is for
-- non-image attachments like deed PDFs, lease contracts, etc.
-- PostgreSQL version
CREATE TABLE IF NOT EXISTS building_documents (
    id          SERIAL PRIMARY KEY,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    url         VARCHAR(500) NOT NULL,
    object_key  VARCHAR(500),
    filename    VARCHAR(255) NOT NULL,
    file_type   VARCHAR(100),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- SQLite-compatible version (use instead of the above CREATE TABLE if on SQLite):
-- CREATE TABLE IF NOT EXISTS building_documents (
--     id          INTEGER PRIMARY KEY AUTOINCREMENT,
--     building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
--     url         TEXT NOT NULL,
--     object_key  TEXT,
--     filename    TEXT NOT NULL,
--     file_type   TEXT,
--     sort_order  INTEGER NOT NULL DEFAULT 0,
--     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );
