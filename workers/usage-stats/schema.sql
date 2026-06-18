CREATE TABLE IF NOT EXISTS installs (
  install_id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  version TEXT,
  browser TEXT
);

CREATE INDEX IF NOT EXISTS idx_installs_last_seen ON installs(last_seen);
