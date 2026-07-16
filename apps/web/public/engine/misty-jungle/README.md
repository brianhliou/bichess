# MistyJungle client engine (vendored wasm)

The in-browser vanilla Jungle (Dou Shou Qi) engine for the review/analysis panel's
"Engine on" toggle — single-threaded WebAssembly, no cross-origin isolation needed (unlike
the Fairy-Stockfish build). Driven from `apps/web/src/review/engine/misty-ceval.ts` via
`worker.js` (a module worker). See that file for the ceval contract.

## Files

- `jungle_wasm.js`, `jungle_wasm_bg.wasm` (+ `.d.ts`) — the wasm-bindgen `--target web`
  output, generated (do not hand-edit).
- `worker.js` — hand-written module worker (identical to the misty-banqi/jungle-flip one):
  loads the wasm and answers `analyze` requests off the main thread. Edit this by hand.

## Regenerating the wasm

Source lives in the private **misty-jungle** repo (`~/projects/misty-jungle`), crate
`jungle-wasm` (a cdylib that `#[path]`-includes the shared engine core — a single
self-contained `engine.rs`, no game/endgame/flatdb split and no `rayon`, so unlike the
Flip Jungle build there is no stub module — and exposes `analyze(fen, nodes, multipv)` over
`root_move_values`). To rebuild after an engine change:

```sh
cd ~/projects/misty-jungle
wasm-pack build jungle-wasm --target web --release --out-dir pkg
cp jungle-wasm/pkg/jungle_wasm.js \
   jungle-wasm/pkg/jungle_wasm_bg.wasm \
   jungle-wasm/pkg/jungle_wasm.d.ts \
   jungle-wasm/pkg/jungle_wasm_bg.wasm.d.ts \
   <mistboard>/apps/web/public/engine/misty-jungle/
```

Then bump `MISTY_ASSET_VERSION` in `misty-ceval.ts` to bust the edge cache.

## No redaction (perfect information)

Vanilla Jungle is PERFECT-INFORMATION — no face-down tiles, no pool — so, unlike
banqi/jieqi/Flip Jungle, there is nothing to redact: the engine is fed the full-board FEN
(`jungleStateToEngineFen` in `@mistboard/game`), the same encoder the server analysis path
uses. `cp` is the engine's native side-to-move score (WIN = 1_000_000; a decisive |cp|
renders as checkmate in the panel).
