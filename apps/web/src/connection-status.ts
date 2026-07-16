// PING / SERVER latency footer for the account dropdown (lichess pattern). The
// site WebSocket is per-room, so this drives off a tiny GET /api/ping instead:
// the client times the round trip for PING and reads the server's event-loop
// lag for SERVER. Polled only while the dropdown is open (start/stop), so an
// idle tab does no background work.

import { t } from './i18n/catalog.js';

export type ConnectionStatus = {
  element: HTMLElement;
  start(): void;
  stop(): void;
};

const POLL_INTERVAL_MS = 2500;

export function createConnectionStatus(): ConnectionStatus {
  const element = document.createElement('div');
  element.className = 'account-nav-status';
  element.setAttribute('aria-label', t('connection.status'));

  const rows = document.createElement('div');
  rows.className = 'account-nav-status-rows';
  const ping = createStatusRow(t('connection.ping'));
  const server = createStatusRow(t('connection.server'));
  rows.append(ping.row, server.row);

  const bars = document.createElement('div');
  bars.className = 'account-nav-status-bars';
  bars.setAttribute('aria-hidden', 'true');
  const barEls: HTMLSpanElement[] = [];
  for (let i = 0; i < 4; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'account-nav-status-bar';
    bars.append(bar);
    barEls.push(bar);
  }

  element.append(rows, bars);

  let timer: number | null = null;
  // Bumped on every stop() and at the start of each measure() so a slow response
  // that resolves after the menu closed (or a newer probe started) is ignored.
  let generation = 0;

  function render(rttMs: number | null, lagMs: number | null): void {
    ping.value.textContent = rttMs === null ? '–' : String(rttMs);
    server.value.textContent = lagMs === null ? '–' : String(lagMs);
    const lit = rttMs === null ? 0 : barsForRtt(rttMs);
    const warn = rttMs !== null && rttMs >= 300;
    barEls.forEach((bar, index) => {
      const on = index < lit;
      bar.classList.toggle('lit', on && !warn);
      bar.classList.toggle('warn', on && warn);
    });
  }

  async function measure(): Promise<void> {
    generation += 1;
    const id = generation;
    const startedAt = performance.now();
    try {
      const resp = await fetch('/api/ping', { cache: 'no-store' });
      if (id !== generation) return;
      const rtt = Math.max(0, Math.round(performance.now() - startedAt));
      const data = (await resp.json()) as { lagMs?: number };
      if (id !== generation) return;
      render(rtt, typeof data.lagMs === 'number' ? data.lagMs : null);
    } catch {
      if (id !== generation) return;
      render(null, null);
    }
  }

  return {
    element,
    start(): void {
      if (timer !== null) return;
      void measure();
      timer = window.setInterval(() => void measure(), POLL_INTERVAL_MS);
    },
    stop(): void {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      // Invalidate any in-flight probe so it can't paint after close.
      generation += 1;
    },
  };
}

function createStatusRow(label: string): { row: HTMLElement; value: HTMLElement } {
  const row = document.createElement('div');
  row.className = 'account-nav-status-row';
  const name = document.createElement('span');
  name.className = 'account-nav-status-label';
  name.textContent = label;
  const value = document.createElement('b');
  value.className = 'account-nav-status-value';
  value.textContent = '–';
  const unit = document.createElement('span');
  unit.className = 'account-nav-status-unit';
  unit.textContent = t('connection.ms');
  row.append(name, value, unit);
  return { row, value };
}

function barsForRtt(rttMs: number): number {
  if (rttMs < 80) return 4;
  if (rttMs < 150) return 3;
  if (rttMs < 300) return 2;
  return 1;
}
