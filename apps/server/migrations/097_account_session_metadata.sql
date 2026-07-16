-- 097_account_session_metadata.sql
-- Device context for self-service session review. IP addresses are deliberately
-- not retained for this surface.

ALTER TABLE account_sessions
  ADD COLUMN IF NOT EXISTS user_agent TEXT;
