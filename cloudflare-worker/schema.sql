-- ============================================================================
-- FMCU VISIT REPORT - CLOUDFLARE D1 SQLITE SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  storeCode TEXT,
  storeName TEXT,
  auditorId TEXT,
  auditorName TEXT,
  scheduledDate TEXT,
  status TEXT,
  rawJson TEXT,
  updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_sch_date ON schedules(scheduledDate);
CREATE INDEX IF NOT EXISTS idx_sch_auditor ON schedules(auditorId);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  name TEXT,
  nik TEXT,
  role TEXT,
  rawJson TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS stores (
  code TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  city TEXT,
  rawJson TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  userId TEXT PRIMARY KEY,
  lat REAL,
  lng REAL,
  status TEXT,
  storeVisit TEXT,
  rawJson TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  storeCode TEXT,
  storeName TEXT,
  visitDate TEXT,
  rawJson TEXT,
  updatedAt TEXT
);
