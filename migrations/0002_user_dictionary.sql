CREATE TABLE IF NOT EXISTS user_dictionary (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_sub TEXT NOT NULL,
  reading TEXT NOT NULL,
  normalized_reading TEXT NOT NULL,
  replacement TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_sub, normalized_reading)
);

CREATE INDEX IF NOT EXISTS user_dictionary_user_reading
  ON user_dictionary (user_sub, reading COLLATE NOCASE);
