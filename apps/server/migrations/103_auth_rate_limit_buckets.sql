-- Durable auth throttles for outbound email and verification traffic.
--
-- The existing process-local sliding windows remain as a fast first layer.
-- These buckets survive restarts and coordinate multiple web processes without
-- retaining raw email addresses or IP addresses in the throttle table.

CREATE TABLE auth_rate_limit_buckets (
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 64),
  subject_hash TEXT NOT NULL CHECK (length(subject_hash) = 64),
  window_started_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL CHECK (hit_count > 0),
  last_hit_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX auth_rate_limit_buckets_last_hit_idx
  ON auth_rate_limit_buckets (last_hit_at);
