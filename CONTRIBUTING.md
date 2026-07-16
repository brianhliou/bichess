# Contributing

Mistboard is an open-source platform for original strategy games, built for
serious play: server-enforced board games and variants across chess, xiangqi,
shogi, Jungle, and related families, including both open-information games and
hidden-information games such as dark chess. Before opening a pull request, check
whether the change helps the product rule:

> Does this make Mistboard a more trustworthy, serious place to play, study,
> rank, or build engines for its games?

If the answer is no, open an issue or discussion first.

For project direction, licensing, branding, reference, roadmap, and monetization
boundaries, see [`docs/project-direction.md`](docs/project-direction.md).

## Scope

Good contributions:

- Fog of War rules correctness
- hidden-information safety
- `PlayerView` tests
- replay and postgame reveal improvements
- board interaction polish
- engine protocol surfaces in `packages/game/src/engine-protocol.ts` and
  `apps/server/src/engine-protocol/`. The first-party engine implementation is
  outside this repository; the public contract is the contribution surface here.
- documentation for rules, protocols, tournaments, and engine integration

Usually out of scope for v1 unless explicitly gate-cleared:

- ungated ratings
- broad public matchmaking
- chat
- moderation tooling
- OAuth
- billing
- broad general chess-platform features

## Development

Prerequisites:

- Node.js 22 or newer
- npm
- Docker, only if you need local Postgres-backed flows

First-time setup:

```bash
npm install
npm run agent:scan        # live dirty-state, worktree, hotspot, and test map
npm run worktree:prepare  # fresh-worktree deps, dist declarations, drift guard
```

Fast local loop:

```bash
npm run dev              # in-memory server, fastest for UI work
```

Open `http://localhost:3000`.

Before a pull request, run checks that match the blast radius:

```bash
npm run verify -- --changed
npm run check:drift       # public-doc links, SQL enum drift, fog payload guards
npm run i18n:check        # app catalog structure, critical coverage, and gap report
npm run ci:quick
npm test                 # unit and integration tests, in-memory
```

For interface copy, English is the source contract and noncritical locale gaps fall back safely.
See [`docs/translations.md`](docs/translations.md) for domain ownership and the critical-key policy.

For replay, reconnect, and persistence work, use local Postgres:

```bash
npm run db:up      # start Docker Postgres on port 5435
npm run db:migrate # apply migrations
npm run dev:persistent
npm run test:persistent  # integration tests against local Postgres
```

Good entry points for dark chess testing:

```text
http://localhost:3000/?room=fog-dev&reset=1&variant=dark-chess
http://localhost:3000/?room=fog-engine-dev&reset=1&variant=dark-chess&dev=engine
```

For mobile/article layout iteration after the dev server is running:

```bash
npm run test:mobile:shots
```

For manual launch gates, write a public-safe evidence entry:

```bash
npm run gate:evidence -- --gate mobile-gameplay --result pass
```

See [GitHub issues](https://github.com/brianhliou/mistboard/issues) for what's
currently being worked on. See [`docs/README.md`](docs/README.md) for the public
documentation map.

## Pull Requests

Keep PRs focused. A small bug fix with a regression test is better than a broad refactor plus product change.

For hidden-information code, include tests that prove forbidden payloads are absent. In Mistboard, a green UI is not enough; the server must not send hidden truth to the wrong client.

Before opening a PR:

- run the relevant tests
- update docs when behavior changes
- keep private planning, provider setup, and secrets out of the public repo (local notes live in the git-ignored `docs-private/`)
- avoid committing generated corpora, large tournament logs, or local artifacts unless they are explicitly part of a reviewed benchmark/release artifact
- do not include secrets, production URLs, API keys, or private credentials

## Contribution Rights

Mistboard uses a Developer Certificate of Origin style contribution policy.

By contributing, you certify that you have the right to submit the contribution and that it may be distributed under the project's license, AGPL-3.0-or-later.

For nontrivial commits, include a sign-off line:

```text
Signed-off-by: Your Name <you@example.com>
```

This project does not currently require a separate Contributor License Agreement. If that changes, it will be documented here before being required.

The workspace packages are marked `private` in their `package.json` to prevent accidental npm publishing. That is repository hygiene, not a repository-visibility policy.

## Governance

See `GOVERNANCE.md`. Contributions are welcome, but Mistboard remains founder-led. Merging a contribution does not grant commit access, release authority, financial control, or ownership of the official project identity.
