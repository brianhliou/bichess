import type { GameEvent, PlayerView } from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initialOpponentMoveSoundForSnapshot,
  shouldDeferHiddenPveOpeningSound,
  terminalSoundPlan,
  tonesForSound,
} from './live-sound.js';

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'sound-test',
    variant: 'dark-chess',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
    ...overrides,
  };
}

function finishAt(kind: Parameters<typeof tonesForSound>[0]): number {
  return Math.max(...tonesForSound(kind).map((tone) => tone.delay + tone.duration));
}

function maxGain(kind: Parameters<typeof tonesForSound>[0]): number {
  return Math.max(...tonesForSound(kind).map((tone) => tone.gain));
}

describe('finish sound tone plans', () => {
  it('keeps the win tone short and ascending', () => {
    const tones = tonesForSound('win');
    expect(finishAt('win')).toBeLessThanOrEqual(0.5);
    expect(tones.map((tone) => tone.frequency)).toEqual([392, 493.88, 659.25]);
    expect(tones.every((tone) => tone.type === 'sine')).toBe(true);
  });

  it('keeps the loss tone softer and descending', () => {
    const tones = tonesForSound('lose');
    expect(finishAt('lose')).toBeLessThanOrEqual(0.4);
    expect(maxGain('lose')).toBeLessThan(maxGain('win'));
    expect(tones.map((tone) => tone.frequency)).toEqual([246.94, 196]);
  });
});

describe('terminal sound sequencing', () => {
  it('suppresses the win jingle when the king was captured (the arpeggio is the fanfare)', () => {
    expect(terminalSoundPlan('win', 'king-captured')).toEqual([]);
    expect(terminalSoundPlan('win', 'general-captured')).toEqual([]);
  });

  it('plays a normal win for non-capture finishes', () => {
    expect(terminalSoundPlan('win', 'timeout')).toEqual([{ kind: 'win', delayMs: 0 }]);
    expect(terminalSoundPlan('win', null)).toEqual([{ kind: 'win', delayMs: 0 }]);
  });

  it('gives the loser a king-fall sting before the defeat sound on capture deaths', () => {
    expect(terminalSoundPlan('lose', 'king-captured')).toEqual([
      { kind: 'king-fall', delayMs: 0 },
      { kind: 'lose', delayMs: 550 },
    ]);
    expect(terminalSoundPlan('lose', 'timeout')).toEqual([{ kind: 'lose', delayMs: 0 }]);
  });

  it('draws play the draw sound regardless of reason', () => {
    expect(terminalSoundPlan('draw', 'repetition')).toEqual([{ kind: 'draw', delayMs: 0 }]);
  });
});

describe('opening opponent sound policy', () => {
  it('infers the hidden PvE white opening from black-to-move first snapshot', () => {
    const events: GameEvent[] = [
      { type: 'room-created', at: 1, roomId: 'sound-test', variant: 'dark-chess', offer: [] },
      {
        type: 'seat-assigned',
        at: 2,
        roomId: 'sound-test',
        clientId: 'builtin-random-legal',
        seat: 'white',
      },
      { type: 'seat-assigned', at: 3, roomId: 'sound-test', clientId: 'human', seat: 'black' },
    ];
    const view = makeView({ status: { type: 'playing', turn: 'black' }, perspective: 'black' });

    expect(initialOpponentMoveSoundForSnapshot(events, view, 'black', 'pve')).toBe('move');
  });

  it('does not infer an opening sound before the engine has moved', () => {
    const view = makeView({ status: { type: 'playing', turn: 'white' }, perspective: 'black' });

    expect(initialOpponentMoveSoundForSnapshot([], view, 'black', 'pve')).toBeNull();
  });

  it('defers the hidden PvE opening delta until audio unlock', () => {
    const previousView = makeView({
      status: { type: 'playing', turn: 'white' },
      perspective: 'black',
    });
    const nextView = makeView({
      status: { type: 'playing', turn: 'black' },
      perspective: 'black',
    });

    expect(shouldDeferHiddenPveOpeningSound(previousView, nextView, 'black', 'pve')).toBe(true);
  });

  it('does not defer ordinary later opponent moves', () => {
    const previousView = makeView({
      moveNumber: 2,
      status: { type: 'playing', turn: 'white' },
      perspective: 'black',
    });
    const nextView = makeView({
      moveNumber: 2,
      status: { type: 'playing', turn: 'black' },
      perspective: 'black',
    });

    expect(shouldDeferHiddenPveOpeningSound(previousView, nextView, 'black', 'pve')).toBe(false);
  });
});

// The reported symptom: arriving in an engine-white PvE room via a full page
// reload leaves the AudioContext suspended (no in-document gesture yet), so the
// engine's opening move only sounds when the visitor first clicks. The SPA
// landing -> room transition keeps the document alive, so the starting click's
// sticky activation lets the room unlock its audio immediately. These tests pin
// both halves of that contract by exercising the real sound controller against a
// fake AudioContext.
describe('audio unlock and sticky activation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  function installFakeAudio(): { oscillatorCount: () => number; peakGain: () => number } {
    let count = 0;
    const gainTargets: number[] = [];
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      sampleRate = 48_000;
      state = 'suspended';
      async resume(): Promise<void> {
        this.state = 'running';
      }
      createOscillator() {
        count += 1;
        return {
          type: 'sine',
          frequency: { setValueAtTime() {} },
          connect: (node: unknown) => node,
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime() {},
            exponentialRampToValueAtTime(value: number) {
              gainTargets.push(value);
            },
          },
          connect: (node: unknown) => node,
        };
      }
      createBuffer(_channels: number, length: number) {
        const samples = new Float32Array(length);
        return { getChannelData: () => samples };
      }
      createBufferSource() {
        return {
          buffer: null,
          playbackRate: { value: 1 },
          connect: (node: unknown) => node,
          start() {},
          stop() {},
        };
      }
      createBiquadFilter() {
        return {
          type: 'bandpass',
          frequency: { setValueAtTime() {} },
          Q: { value: 1 },
          connect: (node: unknown) => node,
        };
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    return { oscillatorCount: () => count, peakGain: () => Math.max(0, ...gainTargets) };
  }

  function setUserActivation(hasBeenActive: boolean): void {
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive, isActive: hasBeenActive },
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'AudioContext');
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'userActivation');
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'localStorage');
    vi.resetModules();
  });

  it('unlocks immediately and sounds a move when the document already has sticky activation', async () => {
    const audio = installFakeAudio();
    setUserActivation(true);
    vi.resetModules();
    const mod = await import('./live-sound.js');

    mod.initLiveSound();
    mod.playSound('move');

    expect(audio.oscillatorCount()).toBeGreaterThan(0);
  });

  it('drives 100% volume with the louder master gain', async () => {
    const audio = installFakeAudio();
    setUserActivation(true);
    window.localStorage.setItem('mistboard.soundVolume', '1');
    window.localStorage.setItem('mistboard.soundMuted', 'false');
    vi.resetModules();
    const mod = await import('./live-sound.js');

    mod.initLiveSound();
    mod.playSound('move');

    expect(audio.peakGain()).toBeCloseTo(0.675);
  });

  it('stays locked on a cold load until the first gesture, then plays', async () => {
    const audio = installFakeAudio();
    setUserActivation(false);
    vi.resetModules();
    const mod = await import('./live-sound.js');

    mod.initLiveSound();
    mod.playSound('move');
    expect(audio.oscillatorCount()).toBe(0);

    window.dispatchEvent(new Event('pointerdown'));
    mod.playSound('move');
    expect(audio.oscillatorCount()).toBeGreaterThan(0);
  });

  it('suppresses the critical-time warning when the account preference is disabled', async () => {
    const audio = installFakeAudio();
    setUserActivation(true);
    window.localStorage.setItem(
      'mistboard.accountPreferences.v1',
      JSON.stringify({ lowTimeSound: false }),
    );
    vi.resetModules();
    const mod = await import('./live-sound.js');

    mod.initLiveSound();
    mod.maybePlayLowTimeSound('sound-pref-disabled', 5_000, 60_000);

    expect(audio.oscillatorCount()).toBe(0);
  });
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
