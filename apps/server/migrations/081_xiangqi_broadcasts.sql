-- 081_xiangqi_broadcasts.sql
-- Offline-first xiangqi broadcast persistence. Raw source payloads are kept
-- beside normalized columns so imports can be audited and replay/export APIs
-- can serve stable Mistboard-native coordinate data.

CREATE TABLE IF NOT EXISTS xiangqi_broadcast_tours (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  location TEXT,
  source_url TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xiangqi_broadcast_rounds (
  id TEXT PRIMARY KEY,
  tour_slug TEXT NOT NULL REFERENCES xiangqi_broadcast_tours(slug) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  starts_at TIMESTAMPTZ,
  source_url TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xiangqi_broadcast_rounds_tour_idx
  ON xiangqi_broadcast_rounds (tour_slug, starts_at, id);

CREATE TABLE IF NOT EXISTS xiangqi_broadcast_boards (
  id TEXT PRIMARY KEY,
  tour_slug TEXT NOT NULL REFERENCES xiangqi_broadcast_tours(slug) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES xiangqi_broadcast_rounds(id) ON DELETE CASCADE,
  source_board_id TEXT NOT NULL,
  board_number INTEGER NOT NULL CHECK (board_number > 0),
  red JSONB NOT NULL,
  black JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'live', 'complete')),
  result TEXT NOT NULL CHECK (result IN ('*', '1-0', '0-1', '1/2-1/2')),
  moves JSONB NOT NULL,
  source_url TEXT,
  ply_count INTEGER NOT NULL CHECK (ply_count >= 0),
  final_status JSONB NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_slug, source_board_id)
);

CREATE INDEX IF NOT EXISTS xiangqi_broadcast_boards_round_idx
  ON xiangqi_broadcast_boards (round_id, board_number, id);

CREATE INDEX IF NOT EXISTS xiangqi_broadcast_boards_tour_idx
  ON xiangqi_broadcast_boards (tour_slug, round_id, board_number);

CREATE TABLE IF NOT EXISTS xiangqi_broadcast_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  tour_slug TEXT,
  round_id TEXT,
  board_id TEXT,
  source_board_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  kind TEXT NOT NULL CHECK (char_length(btrim(kind)) > 0),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) > 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xiangqi_broadcast_sync_logs_board_idx
  ON xiangqi_broadcast_sync_logs (board_id, created_at DESC);

CREATE INDEX IF NOT EXISTS xiangqi_broadcast_sync_logs_tour_idx
  ON xiangqi_broadcast_sync_logs (tour_slug, round_id, created_at DESC);
