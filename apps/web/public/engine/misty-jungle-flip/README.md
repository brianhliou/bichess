# MistyJungleFlip client engine (vendored wasm)

The in-browser Flip Jungle engine for the review/analysis panel's "Engine on" toggle —
single-threaded WebAssembly, no cross-origin isolation needed (unlike the Fairy-Stockfish
build). Driven from `apps/web/src/review/engine/misty-ceval.ts` via `worker.js` (a module
worker). See that file for the ceval contract.

## Files

- `jungle_flip_wasm.js`, `jungle_flip_wasm_bg.wasm` (+ `.d.ts`) — the wasm-bindgen
  `--target web` output, generated (do not hand-edit).
- `worker.js` — hand-written module worker (identical to the misty-banqi one): loads the
  wasm and answers `analyze` requests off the main thread. Edit this by hand.

## Regenerating the wasm

Source lives in the private **misty-flip-jungle** repo (`~/projects/misty-flip-jungle`),
crate `jungle-flip-wasm` (a cdylib that `#[path]`-includes the shared engine core plus a
stub `flatdb` — the real one uses `rayon`, which does not compile to wasm — and exposes
`analyze(fen, nodes, multipv)` over `root_move_values`). To rebuild after an engine change:

```sh
cd ~/projects/misty-flip-jungle
wasm-pack build jungle-flip-wasm --target web --release --out-dir pkg
cp jungle-flip-wasm/pkg/jungle_flip_wasm.js \
   jungle-flip-wasm/pkg/jungle_flip_wasm_bg.wasm \
   jungle-flip-wasm/pkg/jungle_flip_wasm.d.ts \
   jungle-flip-wasm/pkg/jungle_flip_wasm_bg.wasm.d.ts \
   <mistboard>/apps/web/public/engine/misty-jungle-flip/
```

Then bump `MISTY_ASSET_VERSION` in `misty-ceval.ts` to bust the edge cache.

## Redaction

The engine is fed the REDACTED Flip Jungle FEN (`jungleFlipStateToEngineFen` in
`@mistboard/game`) — face-down tiles as `X`, pool as public per-(ink,role) counts —
identical to the server analysis path. The client engine never sees a hidden tile's
identity.
