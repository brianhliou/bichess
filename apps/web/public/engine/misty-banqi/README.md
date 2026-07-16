# MistyBanqi client engine (vendored wasm)

The in-browser Banqi (Flip Xiangqi) engine for the review/analysis panel's "Engine on"
toggle — single-threaded WebAssembly, no cross-origin isolation needed (unlike the
Fairy-Stockfish build). Driven from `apps/web/src/review/engine/misty-ceval.ts` via
`worker.js` (a module worker). See that file for the ceval contract.

## Files

- `banqi_wasm.js`, `banqi_wasm_bg.wasm` (+ `.d.ts`) — the wasm-bindgen `--target web`
  output, generated (do not hand-edit).
- `worker.js` — hand-written module worker: loads the wasm and answers `analyze` requests
  off the main thread. Edit this by hand.

## Regenerating the wasm

Source lives in the private **misty-banqi** repo (`~/projects/misty-banqi`), crate
`banqi-wasm` (a cdylib that `#[path]`-includes the shared engine core and exposes
`analyze(fen, nodes, multipv)` over `root_move_values`). To rebuild after an engine change:

```sh
cd ~/projects/misty-banqi
wasm-pack build banqi-wasm --target web --release --out-dir pkg
cp banqi-wasm/pkg/banqi_wasm.js \
   banqi-wasm/pkg/banqi_wasm_bg.wasm \
   banqi-wasm/pkg/banqi_wasm.d.ts \
   banqi-wasm/pkg/banqi_wasm_bg.wasm.d.ts \
   <mistboard>/apps/web/public/engine/misty-banqi/
```

Then bump `MISTY_ASSET_VERSION` in `misty-ceval.ts` to bust the edge cache.

## Redaction

The engine is fed the REDACTED Banqi FEN (`banqiStateToEngineFen` in `@mistboard/game`) —
face-down tiles as `X`, pool as public per-(ink,role) counts — identical to the server
analysis path. The client engine never sees a hidden tile's identity.
