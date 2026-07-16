// Round-trip validator for the mainline-Pikafish standard-xiangqi bridge.
// Confirms: (1) our move -> Pikafish UCI translation is correct, and (2) every
// bestmove Pikafish returns from `position startpos moves ...` maps back to a
// LEGAL move in our kernel. If orientation/side-to-move were wrong, Pikafish
// would either error or return moves our kernel rejects.
//
//   tsx src/scripts/xiangqi-pikafish-validate.ts [plies]

import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiPlayerView,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import { xiangqiEngineMove, xiangqiMoveToPikafishUci } from '../xiangqi-pikafish-engine.js';

const plies = Number(process.argv[2] ?? 12);

function legalMoves(state: XiangqiGameState): XiangqiMove[] {
  const turn = state.status.type === 'playing' ? state.status.turn : 'red';
  return getStandardXiangqiPlayerView(state, turn).legalMoves;
}

function matchUci(moves: XiangqiMove[], uci: string): XiangqiMove | null {
  return moves.find((m) => xiangqiMoveToPikafishUci(m) === uci) ?? null;
}

async function main(): Promise<void> {
  let state = createInitialXiangqiState('validate');
  const history: string[] = [];
  for (let i = 0; i < plies; i++) {
    if (state.status.type !== 'playing') {
      console.log(`game ended: ${JSON.stringify(state.status)}`);
      break;
    }
    const turn = state.status.turn;
    const uci = await xiangqiEngineMove(history, { nodes: 100_000, movetimeMs: 800 });
    if (!uci) {
      console.error(`ply ${i} (${turn}): pikafish returned NO move`);
      process.exit(1);
    }
    const legal = legalMoves(state);
    const move = matchUci(legal, uci);
    if (!move) {
      console.error(
        `ply ${i} (${turn}): pikafish bestmove ${uci} is NOT a legal move in our kernel`,
      );
      console.error(`  our legal (pikafish uci): ${legal.map(xiangqiMoveToPikafishUci).join(' ')}`);
      process.exit(1);
    }
    console.log(`ply ${i} (${turn}): ${uci}  ->  ${move.from}${move.to}  [OK, legal]`);
    state = applyStandardXiangqiMove(state, move);
    history.push(uci);
  }
  console.log(`\nOK: ${history.length} plies, every Pikafish move was kernel-legal.`);
}

void main();
