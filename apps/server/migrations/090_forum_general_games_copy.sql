-- 090_forum_general_games_copy.sql
-- The forum is not chess-only: reword the general board (and the off-topic
-- description) from "chess" to "games". Copy-only change; ids, slugs, and
-- sort order stay put.

UPDATE forum_categories
SET name = 'General Games Discussion',
    description = 'The place to discuss general games topics.',
    updated_at = now()
WHERE id = 'strategy';

UPDATE forum_categories
SET description = 'Everything that is not related to games.',
    updated_at = now()
WHERE id = 'off-topic-discussion';
