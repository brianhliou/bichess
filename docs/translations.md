# Translations

Mistboard is English-first. English is the source contract for app interface copy. Simplified
Chinese (`zh-Hans`) and Traditional Chinese (`zh-Hant`) are the supported outreach locales.
Adding or retiring a locale is a product decision, not a per-feature requirement.

## North Star

Feature work adds English copy once. Supported locales fall back to English for ordinary gaps,
so incomplete translation work does not block delivery. A small set of critical journey keys must
be translated in every supported outreach locale before landing. Coverage is measured by domain,
and translation work can be batched independently.

The app catalog is split by ownership under `apps/web/src/i18n/catalogs/`:

- `shell`: navigation, homepage chrome, preferences, and shared status
- `content`: rules, articles, policy, and informational pages
- `account`: authentication, account settings, and security
- `community`: profiles, social surfaces, chat, and challenges
- `play`: setup, lobby, live play, and results
- `review`: replay and watch surfaces

## Adding interface copy

1. Add the English key to the appropriate domain catalog.
2. Use the key through `t(...)` in the interface.
3. Add it to that domain's `CRITICAL_*_I18N_KEYS` only when untranslated copy would break a core
   public journey, such as navigation, sign-in, game setup, live play, or result comprehension.
4. If the key is critical, add both Chinese translations in the same change. Otherwise, translation
   can follow in a focused batch and the interface safely falls back to English.
5. Run `npm run i18n:check`.

The checker fails on duplicate or stale keys, unsupported locale catalogs, empty values, invalid
domain ownership, and missing critical translations. Noncritical gaps are reported but do not fail
the command. Machine-readable coverage is available with:

```bash
npm run i18n:check -- --json
```

## Translating articles

Article prose uses a separate value-based dictionary. Partial article translations are valid work
in progress, but they are not public localizations: Chinese index pages link those cards to English,
and a direct localized URL redirects to the complete English prerender.

1. Run `npm run i18n:coverage -- <slug>` to list the article's missing source strings.
2. Add both `zh-Hans` and `zh-Hant` values without changing the English article structure.
3. Get the editorial and terminology review appropriate for the article. Native-language quality
   review remains a human gate; automated coverage proves presence, not correctness.
4. Once both scripts report 100%, explicitly add the slug to `TRANSLATED_ARTICLE_SLUGS` in
   `apps/web/src/article-i18n.ts`. That single publication list drives links, rendering, prerenders,
   hreflang output, and the coverage contract.
5. Run `npm run i18n:check`, the focused article coverage test, and the web build.

After English article edits, `npm run i18n:prune-articles` removes dictionary keys that no longer
have a live source string. The coverage test rejects orphaned keys, including separately localized
SVG labels, so cleanup drift cannot accumulate silently.
