CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_sub TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('romaji', 'japanese')),
  source TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS history_user_created
  ON history (user_email, user_sub, created_at DESC);
