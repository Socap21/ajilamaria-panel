-- ============================================================
--  Ají la María · esquema de la base de datos (Cloudflare D1)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  pass_hash   TEXT NOT NULL,
  pass_salt   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff',   -- 'admin' | 'staff'
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  cat         TEXT,
  precio      REAL NOT NULL DEFAULT 0,
  costo       REAL NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  stock_min   INTEGER NOT NULL DEFAULT 0,
  heat        INTEGER NOT NULL DEFAULT 1,
  em          TEXT,
  activo      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  id          TEXT PRIMARY KEY,
  pid         TEXT NOT NULL,
  nombre      TEXT,
  em          TEXT,
  qty         INTEGER NOT NULL,
  precio      REAL NOT NULL,
  total       REAL NOT NULL,
  fecha       TEXT NOT NULL,
  user_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_fecha ON sales(fecha);
CREATE INDEX IF NOT EXISTS idx_sales_pid ON sales(pid);
