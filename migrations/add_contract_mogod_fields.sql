-- Migration: Add Mogod rent-contract fields to the contracts table
-- Run once against your existing database after deploying this schema update.
--
-- PostgreSQL:  psql $DATABASE_URL -f migrations/add_contract_mogod_fields.sql
-- SQLite:      sqlite3 muktasbat.db < migrations/add_contract_mogod_fields.sql

-- ── Basic contract data (بيانات العقد الأساسية) ──────────────────────────────
-- الفرع
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS branch                      VARCHAR(100);
-- نوع العقد: residential | commercial
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type               VARCHAR(20) NOT NULL DEFAULT 'residential';
-- صلاحية العقد: fixed | open
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS validity_type               VARCHAR(30);
-- مدة العقد — stored as entered by user
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_years              INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_months             INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_days               INTEGER NOT NULL DEFAULT 0;
-- اجمالي قيمة الإيجار لكل المدة — total rent for the full period
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_rent_amount           FLOAT NOT NULL DEFAULT 0;
-- رقم عقد الإيجار (Ejar)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ejar_contract_number        VARCHAR(50);

-- ── Billing (فوترة العقد) ────────────────────────────────────────────────────
-- نوع الدفعة: monthly | quarterly | semi-annual | annual | full
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_type                VARCHAR(30);
-- عدد الدفعات
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_count               INTEGER NOT NULL DEFAULT 1;
-- الكهرباء
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS electricity_on_tenant       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS electricity_split_percentage FLOAT;
-- الماء
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS water_on_tenant             BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS water_split_percentage      FLOAT;
-- خدمات
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS services_amount             FLOAT NOT NULL DEFAULT 0;
-- التأمين
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS insurance_amount            FLOAT NOT NULL DEFAULT 0;

-- ── New table: contract_attachments (مرفقات العقد) ───────────────────────────
CREATE TABLE IF NOT EXISTS contract_attachments (
    id          SERIAL PRIMARY KEY,           -- INTEGER PRIMARY KEY AUTOINCREMENT for SQLite
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    url         VARCHAR(500) NOT NULL,
    object_key  VARCHAR(500),
    filename    VARCHAR(255) NOT NULL,
    file_type   VARCHAR(100),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- SQLite-compatible version (use instead of the above CREATE TABLE if on SQLite):
-- CREATE TABLE IF NOT EXISTS contract_attachments (
--     id          INTEGER PRIMARY KEY AUTOINCREMENT,
--     contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
--     url         TEXT NOT NULL,
--     object_key  TEXT,
--     filename    TEXT NOT NULL,
--     file_type   TEXT,
--     sort_order  INTEGER NOT NULL DEFAULT 0,
--     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );
