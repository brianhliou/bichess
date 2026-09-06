# Fairy-Stockfish (WASM) — vendored engine assets

These files are the client-side analysis engine that powers the review board's
"local engine" (ceval). They run entirely in the browser, in a Web Worker, and
require a cross-origin-isolated context (`SharedArrayBuffer`).

- `stockfish.js` / `stockfish.wasm` / `stockfish.worker.js` — the multi-threaded
  Fairy-Stockfish WASM build.
- `fortress-xiangqi.ini` — our custom-variant definition, written to the engine's
  in-memory FS at load time (`UCI_Variant=fortressxiangqi`, `VariantPath`).
  Standard xiangqi uses Fairy-Stockfish's built-in `xiangqi` variant (no `.ini`).
- `xiangqi-c07e94a5c7cb.nnue` — Fairy-Stockfish's official standard-xiangqi NNUE
  net, the same one the server's Level 8 bot runs. Fetched lazily on the first
  xiangqi evaluation and written to the engine's in-memory FS.

## Provenance

- npm: `fairy-stockfish-nnue.wasm@1.1.12`
- source: https://github.com/fairy-stockfish/fairy-stockfish.wasm
  (upstream engine: https://github.com/fairy-stockfish/Fairy-Stockfish)
- `stockfish.wasm` sha256: `7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6`

- `xiangqi-c07e94a5c7cb.nnue` sha256: `c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11`
  (same net as `XIANGQI_FSF_NNUE_NET` in `apps/server/src/xiangqi-fsf-engine.ts`,
  which railpack pins and sha256-verifies for the server binary)

## The net is not optional

Fairy-Stockfish loads no net unless told to, and its CLASSICAL evaluation has no
xiangqi endgame knowledge: against the 32-position basic-endgame corpus at depth
16 it agreed with the book verdict 17 times out of 32, calling won positions 0cp
draws and one book draw a +523cp win. With this net it is 32/32. Running without
it is not "leaner", it is an analysis board that cannot read an endgame (#363).

`loadXiangqiNet` in `ceval.ts` falls back to classical when the fetch fails, so
that a CDN miss degrades analysis instead of taking the engine panel down. That
fallback is invisible from the outside, which is why `prod:smoke:ceval` gates a
release on the ACTUAL evaluation of a known drawn endgame rather than on the
asset returning 200.

Only standard xiangqi gets the net. Fortress xiangqi shares this engine core but
is a custom `.ini` variant the net does not apply to, so `Use NNUE` is set per
evaluation (`EvalFile` is a global option on a core that outlives any one board).
Bump `ENGINE_ASSET_VERSION` in `ceval.ts` on any change to the files here.

## License

Fairy-Stockfish is licensed under the **GNU General Public License v3.0**. These
vendored binaries are distributed under GPL-3.0; the corresponding source is the
pinned upstream repository above. Full license text:
https://www.gnu.org/licenses/gpl-3.0.txt

To re-vendor from a clean checkout:

```
npm pack fairy-stockfish-nnue.wasm@1.1.12
# extract stockfish.{js,wasm,worker.js} into this directory
```
