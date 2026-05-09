-- Migration: Add Ejar integration tracking fields to the contracts table
-- Idempotent: every statement uses IF NOT EXISTS — safe to re-run.
--
-- PostgreSQL:  psql $DATABASE_URL -f migrations/add_contract_ejar_fields.sql
-- SQLite:      sqlite3 muktasbat.db < migrations/add_contract_ejar_fields.sql

-- "pending" | "registered" | "cancelled" | "failed" | NULL (not submitted yet)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ejar_status         VARCHAR(20);

-- Timestamp when the contract was successfully registered on Ejar
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ejar_registered_at  TIMESTAMP;

-- Full JSON blob from the Ejar API response (for audit trail / debugging)
-- PostgreSQL uses JSONB for indexable JSON; change to TEXT for SQLite
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ejar_response_data  JSONB;
-- SQLite:
-- ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ejar_response_data TEXT;
