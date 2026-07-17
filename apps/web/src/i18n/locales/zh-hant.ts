// zh-Hant app catalog: every domain's translations, aggregated into the single
// lazy chunk that ensureLocaleCatalog('zh-Hant') loads. Never import this
// module statically from entry-reachable code: that puts all the strings back
// in the entry chunk for every visitor. Domain names must match the domain
// definitions in src/i18n/catalog.ts (the loader's return type enforces it).

import { ZH_HANT_ACCOUNT } from '../catalogs/account.zh-hant.js';
import { ZH_HANT_COMMUNITY } from '../catalogs/community.zh-hant.js';
import { ZH_HANT_CONTENT } from '../catalogs/content.zh-hant.js';
import { ZH_HANT_PLAY } from '../catalogs/play.zh-hant.js';
import { ZH_HANT_REVIEW } from '../catalogs/review.zh-hant.js';
import { ZH_HANT_SHELL } from '../catalogs/shell.zh-hant.js';

export const domains = {
  shell: ZH_HANT_SHELL,
  content: ZH_HANT_CONTENT,
  account: ZH_HANT_ACCOUNT,
  community: ZH_HANT_COMMUNITY,
  play: ZH_HANT_PLAY,
  review: ZH_HANT_REVIEW,
} as const;
