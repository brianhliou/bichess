// Shared recovery for stale Vite chunks. A tab can keep an older entry bundle
// across a deploy, then discover that a lazily imported hashed chunk no longer
// exists. Reload once to fetch the current entry bundle and its chunk map; cap
// the attempt in sessionStorage so a genuinely missing asset cannot reload-loop.
const CHUNK_RELOAD_FLAG = 'mistboard.chunkReloadAttempted';

export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('Failed to fetch dynamically imported module') || // Chromium
    message.includes('error loading dynamically imported module') || // Firefox
    message.includes('Importing a module script failed') // Safari
  );
}

function chunkReloadAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_FLAG) !== null;
  } catch {
    // Storage unavailable (private mode, etc.): treat as already tried so we
    // fall through to a stable error state instead of risking a reload loop.
    return true;
  }
}

export function clearChunkReloadAttempt(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // No-op when storage is unavailable.
  }
}

export function shouldReloadForChunkLoadError(err: unknown): boolean {
  if (!isChunkLoadError(err) || chunkReloadAlreadyAttempted()) return false;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
  } catch {
    return false;
  }
  return true;
}

export function reloadForChunkLoadError(err: unknown): boolean {
  if (!shouldReloadForChunkLoadError(err)) return false;
  location.reload();
  return true;
}
