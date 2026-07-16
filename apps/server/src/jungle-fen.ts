// The Jungle UCI FEN encoder moved to @mistboard/game so the in-browser client engine
// (jungle-wasm) builds the identical full-board FEN the server does — one encoder on both
// sides. Kept as a re-export so server importers are unchanged.
export {
  engineUciToJungleMove,
  jungleMoveToEngineUci,
  jungleStateToEngineFen,
} from '@mistboard/game';
