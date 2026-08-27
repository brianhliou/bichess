// zh-Hans app catalog: every domain's translations, aggregated into the single
// lazy chunk that ensureLocaleCatalog('zh-Hans') loads. Never import this
// module statically from entry-reachable code: that puts all the strings back
// in the entry chunk for every visitor. Domain names must match the domain
// definitions in src/i18n/catalog.ts (the loader's return type enforces it).

import { ZH_HANS_ACCOUNT } from '../catalogs/account.zh-hans.js';
import { ZH_HANS_COMMUNITY } from '../catalogs/community.zh-hans.js';
import { ZH_HANS_CONTENT } from '../catalogs/content.zh-hans.js';
import { ZH_HANS_EDITOR } from '../catalogs/editor.zh-hans.js';
import { ZH_HANS_PLAY } from '../catalogs/play.zh-hans.js';
import { ZH_HANS_REVIEW } from '../catalogs/review.zh-hans.js';
import { ZH_HANS_SHELL } from '../catalogs/shell.zh-hans.js';

export const domains = {
  shell: ZH_HANS_SHELL,
  content: ZH_HANS_CONTENT,
  account: ZH_HANS_ACCOUNT,
  community: ZH_HANS_COMMUNITY,
  play: ZH_HANS_PLAY,
  review: ZH_HANS_REVIEW,
  editor: ZH_HANS_EDITOR,
} as const;
