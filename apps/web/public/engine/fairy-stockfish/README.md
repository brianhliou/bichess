# Fairy-Stockfish (WASM) — vendored engine assets

These files are the client-side analysis engine that powers the review board's
"local engine" (ceval). They run entirely in the browser, in a Web Worker, and
require a cross-origin-isolated context (`SharedArrayBuffer`).

- `stockfish.js` / `stockfish.wasm` / `stockfish.worker.js` — the multi-threaded
  Fairy-Stockfish WASM build.
- `fortress-xiangqi.ini` — our custom-variant definition, written to the engine's
  in-memory FS at load time (`UCI_Variant=fortressxiangqi`, `VariantPath`).
  Standard xiangqi uses Fairy-Stockfish's built-in `xiangqi` variant (no `.ini`).

## Provenance

- npm: `fairy-stockfish-nnue.wasm@1.1.12`
- source: https://github.com/fairy-stockfish/fairy-stockfish.wasm
  (upstream engine: https://github.com/fairy-stockfish/Fairy-Stockfish)
- `stockfish.wasm` sha256: `7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6`

No NNUE net is bundled; the engine uses its classical evaluation. That is enough
for review-board analysis and keeps the payload lean. A variant net can be added
later by writing it to the FS and `setoption name EvalFile`.

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
