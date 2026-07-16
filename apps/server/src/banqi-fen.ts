// The Banqi UCI FEN encoder moved to @mistboard/game so the in-browser client engine
// (banqi-wasm) builds the identical redacted FEN the server does — same redaction
// boundary on both sides. This module is kept as a re-export so server importers
// (banqi-engine, server-banqi-engine, banqi-analysis, jungle-flip-fen) are unchanged.
export {
  banqiMoveToEngineUci,
  banqiSquareToEngineUci,
  banqiStateToEngineFen,
  engineUciToBanqiMove,
} from '@mistboard/game';
