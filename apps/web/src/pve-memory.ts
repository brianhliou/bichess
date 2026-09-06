// The engine a device last started a bot game against, per variant. Written by
// every one-click bot start (Lobby row, Quick Pairing chip) and by the setup
// dialog, read by the landing bot policy so a returning player gets the level
// they last chose while a first-time visitor gets the bottom rung (#365).
//
// Shares the setup dialog's `mistboard:setup:pve` record and touches only its
// `engineIdByGameSpec` map, so the dialog's own memory (pace, colour, rated) is
// neither interpreted nor dropped here.
const PVE_PREFERENCE_STORAGE_KEY = 'mistboard:setup:pve';

type PveRecord = Record<string, unknown> & { engineIdByGameSpec?: unknown };

function readRecord(): PveRecord {
  try {
    const raw = window.localStorage.getItem(PVE_PREFERENCE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PveRecord)
      : {};
  } catch {
    return {};
  }
}

function engineMap(record: PveRecord): Record<string, unknown> {
  const map = record.engineIdByGameSpec;
  return map && typeof map === 'object' && !Array.isArray(map)
    ? (map as Record<string, unknown>)
    : {};
}

export function rememberedPveEngine(gameSpecId: string): string | null {
  const id = engineMap(readRecord())[gameSpecId];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function rememberPveEngine(gameSpecId: string, engineId: string): void {
  const record = readRecord();
  const next = { ...record, engineIdByGameSpec: { ...engineMap(record), [gameSpecId]: engineId } };
  try {
    window.localStorage.setItem(PVE_PREFERENCE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be disabled; the next visit simply starts on the first-game rung again.
  }
}
