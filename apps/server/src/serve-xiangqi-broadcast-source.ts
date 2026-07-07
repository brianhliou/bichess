// Serve a xiangqi broadcast fixture pack as a local fake source.

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  readXiangqiBroadcastFixturePack,
  resolveXiangqiBroadcastInputPath,
} from './import-xiangqi-broadcast.js';
import {
  type XiangqiBroadcastSourceMode,
  xiangqiBroadcastSourceResponse,
} from './xiangqi-broadcast-sim.js';

type Args = {
  dir: string;
  tape: string;
  mode: XiangqiBroadcastSourceMode;
  port: number;
  timeoutDelayMs: number;
};

const MODES: readonly XiangqiBroadcastSourceMode[] = [
  'clean',
  'stale',
  'malformed',
  'error',
  'timeout',
];

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8')) as unknown;
}

function parseCliArgs(argv: string[]): Args {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      tape: { type: 'string', default: 'tape.json' },
      mode: { type: 'string', default: 'clean' },
      port: { type: 'string', default: '3127' },
      'timeout-delay-ms': { type: 'string', default: '30000' },
    },
  });
  if (!values.dir) {
    console.error(
      'usage: serve-xiangqi-broadcast-source --dir <fixture-pack> [--tape tape.json] [--mode clean|stale|malformed|error|timeout] [--port 3127] [--timeout-delay-ms 30000]',
    );
    process.exit(1);
  }
  if (!MODES.includes(values.mode as XiangqiBroadcastSourceMode)) {
    console.error(`--mode must be one of ${MODES.join(', ')}`);
    process.exit(1);
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port <= 0) {
    console.error('--port must be a positive integer');
    process.exit(1);
  }
  const timeoutDelayMs = Number(values['timeout-delay-ms']);
  if (!Number.isInteger(timeoutDelayMs) || timeoutDelayMs <= 0) {
    console.error('--timeout-delay-ms must be a positive integer');
    process.exit(1);
  }
  return {
    dir: values.dir,
    tape: values.tape,
    mode: values.mode as XiangqiBroadcastSourceMode,
    port,
    timeoutDelayMs,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const pack = await readXiangqiBroadcastFixturePack(args.dir);
  const tape = await readJsonFile(join(resolveXiangqiBroadcastInputPath(args.dir), args.tape));
  const startedAt = Date.now();

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const writeSourceResponse = () => {
      const atMs = Number(url.searchParams.get('atMs') ?? Date.now() - startedAt);
      const source = xiangqiBroadcastSourceResponse(
        pack,
        tape,
        Number.isFinite(atMs) ? atMs : 0,
        args.mode,
      );
      response.setHeader('content-type', 'application/json');

      if (url.pathname === '/health') {
        response.writeHead(200).end(JSON.stringify({ ok: true, mode: args.mode }));
        return;
      }
      if (source.status !== 200) {
        response.writeHead(source.status).end(JSON.stringify(source.body));
        return;
      }
      if ('malformed' in source.body) {
        response.writeHead(200).end(JSON.stringify(source.body));
        return;
      }
      if (url.pathname === '/tour.json') {
        response.writeHead(200).end(JSON.stringify(source.body.tour));
        return;
      }
      if (url.pathname === '/rounds.json') {
        response.writeHead(200).end(JSON.stringify(source.body.rounds));
        return;
      }
      if (url.pathname === '/boards.json') {
        response.writeHead(200).end(JSON.stringify(source.body.boards));
        return;
      }
      if (url.pathname === '/source.json') {
        response.writeHead(200).end(JSON.stringify(source.body));
        return;
      }
      response.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    };

    if (args.mode === 'timeout' && url.pathname !== '/health') {
      setTimeout(writeSourceResponse, args.timeoutDelayMs).unref();
      return;
    }

    writeSourceResponse();
  });

  await new Promise<void>((resolve) => server.listen(args.port, resolve));
  console.log(`xiangqi broadcast fixture source listening on http://localhost:${args.port}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
