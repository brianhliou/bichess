-- 135_forum_category_i18n.sql
-- Localized forum category names and descriptions.
--
-- The four category names and their descriptions are the whole visible structure
-- of /forum, and they had no translation of any kind: the page chrome around them
-- is fully localized (142 forum.* catalog keys, 100% in both scripts) while the
-- rows themselves came out of this table in English and rendered that way on
-- every locale. The i18n gate could not see it, because a gate that diffs
-- catalogs cannot see text that never enters a catalog.
--
-- Same overlay shape as studies (115_study_i18n) and for the same reasons: the
-- `name` / `description` columns stay the fallback, a missing locale or field
-- degrades one string at a time, and there is no duplicate category row per
-- language to fork the topics beneath it.
--
--   {"zh-Hans": {"name": "...", "description": "..."}, "zh-Hant": {...}}
--
-- Categories are seeded by migration rather than authored in a UI (there is no
-- category editor), so the translations are seeded here beside them. A category
-- added later without an overlay renders in English, which is the same degrade
-- every other overlay makes.

ALTER TABLE forum_categories
  ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN forum_categories.i18n IS
  'Per-locale overrides for name/description, keyed by locale code. Falls back to the base columns.';

UPDATE forum_categories SET i18n = jsonb_build_object(
  'zh-Hans', jsonb_build_object(
    'name', '综合棋类讨论',
    'description', '讨论各类棋牌话题的地方。'
  ),
  'zh-Hant', jsonb_build_object(
    'name', '綜合棋類討論',
    'description', '討論各類棋牌話題的地方。'
  )
) WHERE slug = 'general-discussion';

UPDATE forum_categories SET i18n = jsonb_build_object(
  'zh-Hans', jsonb_build_object(
    'name', 'Mistboard 反馈',
    'description', '错误报告、功能请求和建议。'
  ),
  'zh-Hant', jsonb_build_object(
    'name', 'Mistboard 意見反饋',
    'description', '錯誤回報、功能請求和建議。'
  )
) WHERE slug = 'feedback';

UPDATE forum_categories SET i18n = jsonb_build_object(
  'zh-Hans', jsonb_build_object(
    'name', '对局分析',
    'description', '贴出你的对局，和大家一起分析。'
  ),
  'zh-Hant', jsonb_build_object(
    'name', '對局分析',
    'description', '貼出你的對局，和大家一起分析。'
  )
) WHERE slug = 'game-analysis';

UPDATE forum_categories SET i18n = jsonb_build_object(
  'zh-Hans', jsonb_build_object(
    'name', '闲聊灌水',
    'description', '与棋类无关的一切话题。'
  ),
  'zh-Hant', jsonb_build_object(
    'name', '閒聊灌水',
    'description', '與棋類無關的一切話題。'
  )
) WHERE slug = 'off-topic-discussion';
