// Production entry point. Imports index.ts (which is now side-effect-free)
// and calls startServer(). The split is so the integration test harness can
// import internals without booting a listener.

// startServer() reads PORT from env itself; do not pass it explicitly, or the
// "listening" log is suppressed by the `!options.port` gate (which exists so
// the harness on port:0 stays quiet).

import { verifyEngineBinariesAtBoot } from './engine-boot-check.js';
import { installShutdownHandlers, startServer } from './index.js';
import { logger, startObservability } from './obs.js';

installShutdownHandlers();
const started = await startServer();
const stopObs = startObservability({
  roomCount: () => started.rooms.size,
  wsClientCount: started.wsClientCount,
});
logger.info({ kind: 'boot', port: started.port }, 'observability started');

// Deploy tripwire: alert loudly if an enabled variant's engine binary was never
// provisioned. Prod-only (this entry point is not used by the port:0 test harness).
verifyEngineBinariesAtBoot();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopObs();
  });
}
