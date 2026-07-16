/**
 * Reference third-party bot server.
 *
 * A minimal, self-contained HTTP server that speaks the Mistboard engine
 * protocol: it receives a fog-redacted `EngineTurnRequest` on
 * `POST /internal/engine/turn` (bearer-authed) and returns an
 * `EngineTurnResponse` with a legal move. The stub move-picker just plays a
 * move from `request.legalMoves` chosen deterministically by `engineSeed`.
 *
 * This is the artifact we hand an external bot author: the wire contract plus a
 * working skeleton they drop their own engine into (replace `pickMove`). It is
 * also how we smoke the arbiter's HTTP transport end-to-end without the Python
 * engine-worker (see reference-match.test.ts).
 *
 * It is NOT used as the "3P" seat in the real strength oracle — that seat is a
 * real Misty (v1.1) served by the engine-worker. This stub plays at random-legal
 * strength.
 */
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type {
  EngineObservationAck,
  EngineObservationPush,
  EngineTurnRequest,
  EngineTurnResponse,
  Move,
} from '@mistboard/game';

export type ReferenceBotOptions = {
  port: number;
  token: string;
  host?: string;
  /** Override the move policy. Default: deterministic pick by engineSeed. */
  pickMove?: (request: EngineTurnRequest) => Move;
  /**
   * Optional handler for the post-move observation push (`POST
   * /internal/engine/observe`). A real bot updates its belief here and may start
   * pondering. The stub just acks. Safe to omit — the same observation also
   * arrives in the next turn request.
   */
  onObserve?: (push: EngineObservationPush) => void;
};

export type ReferenceBotHandle = {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
};

/** Deterministic, reproducible legal move: index by the per-turn engine seed. */
export function defaultPickMove(request: EngineTurnRequest): Move {
  const moves = request.legalMoves;
  if (moves.length === 0) throw new Error('no legal moves in request');
  const idx = ((request.engineSeed % moves.length) + moves.length) % moves.length;
  return moves[idx]!;
}

export function startReferenceBotServer(opts: ReferenceBotOptions): Promise<ReferenceBotHandle> {
  const host = opts.host ?? '127.0.0.1';
  const pickMove = opts.pickMove ?? defaultPickMove;

  const server = createServer((req, res) => {
    const isTurn = req.method === 'POST' && !!req.url?.endsWith('/internal/engine/turn');
    const isObserve = req.method === 'POST' && !!req.url?.endsWith('/internal/engine/observe');
    if (!isTurn && !isObserve) {
      res.writeHead(404).end('not found');
      return;
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${opts.token}`) {
      res.writeHead(401).end('unauthorized');
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (err) {
        res.writeHead(400).end(`bad request: ${(err as Error).message}`);
        return;
      }
      // Post-move observation push: update belief / start pondering here. The
      // stub just acks.
      if (isObserve) {
        const push = body as EngineObservationPush;
        try {
          opts.onObserve?.(push);
        } catch {
          // A bot's own observe-side error must not fail the ack.
        }
        const ack: EngineObservationAck = {
          protocolVersion: '1',
          gameId: push.gameId,
          sessionId: push.sessionId,
          received: true,
        };
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ack));
        return;
      }
      // Turn request: return a legal move.
      const request = body as EngineTurnRequest;
      try {
        const move = pickMove(request);
        const response: EngineTurnResponse = {
          protocolVersion: '1',
          gameId: request.gameId,
          sessionId: request.sessionId,
          move,
          diagnostics: { engine: 'reference-random-legal' },
        };
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(500).end(`engine error: ${(err as Error).message}`);
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        server,
        port,
        url: `http://${host}:${port}`,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

// ---- CLI: `tsx src/bot-match/reference-bot-server.ts --port 7802 --token secret` ----

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const port = Number(get('--port') ?? process.env.REFERENCE_BOT_PORT ?? 7802);
  const token = get('--token') ?? process.env.REFERENCE_BOT_TOKEN;
  if (!token) throw new Error('reference bot requires --token or REFERENCE_BOT_TOKEN');
  const handle = await startReferenceBotServer({ port, token });
  // eslint-disable-next-line no-console
  console.log(`[reference-bot] listening on ${handle.url}/internal/engine/turn`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
