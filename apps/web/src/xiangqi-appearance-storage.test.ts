import { describe, expect, it } from 'vitest';
import {
  normalizeXiangqiBoardLayout,
  normalizeXiangqiBoardTheme,
  normalizeXiangqiPieceSet,
  readStoredXiangqiBoardLayout,
  readStoredXiangqiBoardTheme,
  readStoredXiangqiPieceSet,
  writeStoredXiangqiBoardLayout,
  writeStoredXiangqiBoardTheme,
  writeStoredXiangqiPieceSet,
} from './xiangqi-appearance-storage.js';

function installLocalStorage(): Storage {
  const values = new Map<string, string>();
  const storage: Storage = {
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    get length() {
      return values.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

describe('xiangqi appearance storage normalization', () => {
  it('defaults unknown board layouts to classic intersections', () => {
    expect(normalizeXiangqiBoardLayout(null)).toBe('intersection');
    expect(normalizeXiangqiBoardLayout('unknown')).toBe('intersection');
    expect(normalizeXiangqiBoardLayout('cell')).toBe('cell');
  });

  it('persists the opt-in square-grid layout', () => {
    installLocalStorage();
    writeStoredXiangqiBoardLayout('cell');
    expect(readStoredXiangqiBoardLayout()).toBe('cell');
  });

  it('uses International as the default board style and legacy migration target', () => {
    expect(normalizeXiangqiBoardTheme(null)).toBe('international');
    expect(normalizeXiangqiBoardTheme('unknown')).toBe('international');
    expect(normalizeXiangqiBoardTheme('paper-garden')).toBe('international');
    expect(normalizeXiangqiBoardTheme('tournament')).toBe('international');
    expect(normalizeXiangqiBoardTheme('blue')).toBe('international');
    expect(normalizeXiangqiBoardTheme('mono')).toBe('international');
    expect(normalizeXiangqiBoardTheme('traditional')).toBe('traditional');
  });

  it('migrates stored legacy board themes to International', () => {
    const storage = installLocalStorage();
    storage.setItem('mistboard.xiangqiBoardTheme', 'tournament');
    storage.setItem('mistboard.xiangqiBoardThemeVersion', '3');
    expect(readStoredXiangqiBoardTheme()).toBe('international');
    expect(storage.getItem('mistboard.xiangqiBoardTheme')).toBe('international');
    expect(storage.getItem('mistboard.xiangqiBoardThemeVersion')).toBe('4');
  });

  it('keeps explicit Traditional board style after the migration version is written', () => {
    installLocalStorage();
    writeStoredXiangqiBoardTheme('traditional');
    expect(readStoredXiangqiBoardTheme()).toBe('traditional');
  });

  it('migrates old animal piece-set values to Dobutsu', () => {
    expect(normalizeXiangqiPieceSet('animal')).toBe('animal-dobutsu');
    expect(normalizeXiangqiPieceSet('animal-seal')).toBe('animal-dobutsu');
    expect(normalizeXiangqiPieceSet('animal-origami')).toBe('animal-dobutsu');
  });

  it('resets existing browser piece-set storage to International on this rollout', () => {
    const storage = installLocalStorage();
    storage.setItem('mistboard.xiangqiPieceSet', 'traditional');
    expect(readStoredXiangqiPieceSet()).toBe('international');
    expect(storage.getItem('mistboard.xiangqiPieceSet')).toBe('international');
    expect(storage.getItem('mistboard.xiangqiPieceSetVersion')).toBe('3');
  });

  it('keeps user changes after the International rollout version is written', () => {
    installLocalStorage();
    writeStoredXiangqiPieceSet('traditional');
    expect(readStoredXiangqiPieceSet()).toBe('traditional');
  });

  it('accepts and persists the Chess-style prototype', () => {
    installLocalStorage();
    expect(normalizeXiangqiPieceSet('international-flat')).toBe('international-flat');
    writeStoredXiangqiPieceSet('international-flat');
    expect(readStoredXiangqiPieceSet()).toBe('international-flat');
  });

  it('previews a URL-pinned piece set without replacing the saved preference', () => {
    const storage = installLocalStorage();
    writeStoredXiangqiPieceSet('traditional');
    window.history.replaceState({}, '', '/?xqPieces=international-flat');
    expect(readStoredXiangqiPieceSet()).toBe('international-flat');
    expect(storage.getItem('mistboard.xiangqiPieceSet')).toBe('traditional');
    window.history.replaceState({}, '', '/');
  });
});
