-- 129_forum_translations.sql
-- Cached machine translations of forum text (topic titles and post bodies).
--
-- Forum text is written once and read many times, so a translation is keyed
-- by the content it translates, not by the row: sha256 of the normalized
-- source text, the target interface locale, and the model that produced it.
-- An edit changes the hash, so stale translations never surface and nothing
-- needs invalidating; a model change changes the key, so old output ages out
-- without a flush. Two posts with identical text share one translation.
--
-- source_kind / source_id record what first asked for the row. They are for
-- auditing spend ("which thread cost us money"), not for lookup, and are not
-- foreign keys: the translation stays valid if the post is later hidden or
-- deleted, and the next identical text simply hits it.

CREATE TABLE IF NOT EXISTS forum_translations (
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  target_locale TEXT NOT NULL CHECK (target_locale IN ('en', 'zh-Hans', 'zh-Hant')),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 80),
  translated_text TEXT NOT NULL CHECK (char_length(translated_text) BETWEEN 1 AND 20000),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('topic', 'post')),
  source_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_hash, target_locale, model)
);

-- "What did this thread's translations cost" walks from the source side.
CREATE INDEX IF NOT EXISTS forum_translations_source_idx
  ON forum_translations (source_kind, source_id);
