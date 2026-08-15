-- The bench records board. One row per player per tier: a returning player
-- updates their best instead of filling the board with forty runs.
CREATE TABLE IF NOT EXISTS scores (
  player_id  TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  difficulty TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  time_sec   INTEGER NOT NULL,
  mistakes   INTEGER NOT NULL,
  dial_style TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, difficulty)
);

-- Matches the board's ORDER BY exactly, so top-N is an index scan.
CREATE INDEX IF NOT EXISTS idx_scores_board
  ON scores (difficulty, score DESC, time_sec ASC);

-- Fixed-window rate limit. Keyed by a salted hash of the IP — the raw address
-- is never stored.
CREATE TABLE IF NOT EXISTS rate (
  ip_hash      TEXT    PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
