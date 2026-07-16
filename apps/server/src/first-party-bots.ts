export type FirstPartyBotProfile = {
  id: string;
  displayName: string;
  activeEngineId: string;
  attributionEngineIds?: readonly string[];
  defaultGameSpecId: string;
};

export const MISTY_DARK_CHESS_ACTIVE_ENGINE_ID = 'python-v2-v1.5';

export const FIRST_PARTY_BOT_PROFILES: readonly FirstPartyBotProfile[] = [
  {
    id: 'misty-dark-chess',
    displayName: 'Misty',
    activeEngineId: MISTY_DARK_CHESS_ACTIVE_ENGINE_ID,
    attributionEngineIds: [
      'python-v2-v1.0',
      'python-v2-v1.1',
      'python-v2-v1.2',
      'python-v2-v1.3',
      'python-v2-v1.4',
    ],
    defaultGameSpecId: 'dark-chess',
  },
  {
    id: 'misty-dmx',
    displayName: 'Misty DMX',
    activeEngineId: 'python-dmx-v1.0',
    defaultGameSpecId: 'dark-mini-xiangqi',
  },
  {
    id: 'pika-jieqi-amateur',
    displayName: 'PikaJieQi - Amateur',
    activeEngineId: 'pikafish-jieqi-amateur',
    defaultGameSpecId: 'jieqi',
  },
  {
    id: 'pika-jieqi',
    displayName: 'PikaJieQi - Strong',
    activeEngineId: 'pikafish-jieqi-strong',
    defaultGameSpecId: 'jieqi',
  },
  {
    id: 'pika-jieqi-strongest',
    displayName: 'PikaJieQi - Strongest',
    activeEngineId: 'pikafish-jieqi-strongest',
    defaultGameSpecId: 'jieqi',
  },
  {
    id: 'misty-banqi',
    displayName: 'MistyBanqi',
    activeEngineId: 'misty-banqi',
    defaultGameSpecId: 'banqi',
  },
  {
    id: 'fairy-stockfish-crossroads-amateur',
    displayName: 'Fairy Stockfish - Amateur',
    activeEngineId: 'fairy-stockfish-crossroads-amateur',
    defaultGameSpecId: 'crossroads-chess',
  },
  {
    id: 'fairy-stockfish-crossroads',
    displayName: 'Fairy Stockfish - Strong',
    activeEngineId: 'fairy-stockfish-crossroads-strong',
    defaultGameSpecId: 'crossroads-chess',
  },
  {
    id: 'fairy-stockfish-crossroads-strongest',
    displayName: 'Fairy Stockfish - Strongest',
    activeEngineId: 'fairy-stockfish-crossroads-very-strong',
    defaultGameSpecId: 'crossroads-chess',
  },
  {
    id: 'fairy-stockfish-drop-mini-xiangqi-amateur',
    displayName: 'Fairy Stockfish - Amateur',
    activeEngineId: 'fairy-stockfish-drop-mini-xiangqi-amateur',
    defaultGameSpecId: 'drop-mini-xiangqi',
  },
  {
    id: 'fairy-stockfish-drop-mini-xiangqi',
    displayName: 'Fairy Stockfish - Strong',
    activeEngineId: 'fairy-stockfish-drop-mini-xiangqi-strong',
    defaultGameSpecId: 'drop-mini-xiangqi',
  },
  {
    id: 'fairy-stockfish-drop-mini-xiangqi-strongest',
    displayName: 'Fairy Stockfish - Strongest',
    activeEngineId: 'fairy-stockfish-drop-mini-xiangqi-very-strong',
    defaultGameSpecId: 'drop-mini-xiangqi',
  },
  {
    id: 'fairy-stockfish-fortress-xiangqi-amateur',
    displayName: 'Fairy Stockfish - Amateur',
    activeEngineId: 'fairy-stockfish-fortress-xiangqi-amateur',
    defaultGameSpecId: 'fortress-xiangqi',
  },
  {
    id: 'fairy-stockfish-fortress-xiangqi',
    displayName: 'Fairy Stockfish - Strong',
    activeEngineId: 'fairy-stockfish-fortress-xiangqi-strong',
    defaultGameSpecId: 'fortress-xiangqi',
  },
  {
    id: 'fairy-stockfish-fortress-xiangqi-strongest',
    displayName: 'Fairy Stockfish - Strongest',
    activeEngineId: 'fairy-stockfish-fortress-xiangqi-very-strong',
    defaultGameSpecId: 'fortress-xiangqi',
  },
  // Standard-Xiangqi engine identities. FSF's eight levels form the public
  // human ladder; lower Pikafish levels remain registered for history and EvE,
  // while only the strongest Pikafish profile is public. The retired
  // amateur/strong/strongest tiers
  // were absorbed into the matching levels: their bot ids continue as the
  // Level 2/5/8 profiles (migration-056 convention, so existing URLs and
  // historical game attribution stay stable) and their engine ids resolve via
  // attributionEngineIds (the Misty convention for retired engine versions).
  {
    id: 'fairy-stockfish-xiangqi-level-1',
    displayName: 'Fairy-Stockfish - Level 1',
    activeEngineId: 'fairy-stockfish-xiangqi-level-1',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-xiangqi-level-2',
    displayName: 'Fairy-Stockfish - Level 2',
    activeEngineId: 'fairy-stockfish-xiangqi-level-2',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-xiangqi-level-3',
    displayName: 'Fairy-Stockfish - Level 3',
    activeEngineId: 'fairy-stockfish-xiangqi-level-3',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-xiangqi-level-4',
    displayName: 'Fairy-Stockfish - Level 4',
    activeEngineId: 'fairy-stockfish-xiangqi-level-4',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-xiangqi-level-5',
    displayName: 'Fairy-Stockfish - Level 5',
    activeEngineId: 'fairy-stockfish-xiangqi-level-5',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-xiangqi-level-6',
    displayName: 'Fairy-Stockfish - Level 6',
    activeEngineId: 'fairy-stockfish-xiangqi-level-6',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-xiangqi-level-7',
    displayName: 'Fairy-Stockfish - Level 7',
    activeEngineId: 'fairy-stockfish-xiangqi-level-7',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-xiangqi-level-8',
    displayName: 'Fairy-Stockfish - Level 8',
    activeEngineId: 'fairy-stockfish-xiangqi-level-8',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi-level-1',
    displayName: 'Pikafish - Level 1',
    activeEngineId: 'pikafish-xiangqi-level-1',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi-amateur',
    displayName: 'Pikafish - Level 2',
    activeEngineId: 'pikafish-xiangqi-level-2',
    attributionEngineIds: ['pikafish-xiangqi-amateur'],
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi-level-3',
    displayName: 'Pikafish - Level 3',
    activeEngineId: 'pikafish-xiangqi-level-3',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi-level-4',
    displayName: 'Pikafish - Level 4',
    activeEngineId: 'pikafish-xiangqi-level-4',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi',
    displayName: 'Pikafish - Level 5',
    activeEngineId: 'pikafish-xiangqi-level-5',
    attributionEngineIds: ['pikafish-xiangqi-strong'],
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi-level-6',
    displayName: 'Pikafish - Level 6',
    activeEngineId: 'pikafish-xiangqi-level-6',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi-level-7',
    displayName: 'Pikafish - Level 7',
    activeEngineId: 'pikafish-xiangqi-level-7',
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'pikafish-xiangqi-strongest',
    displayName: 'Pikafish',
    activeEngineId: 'pikafish-xiangqi-level-8',
    attributionEngineIds: ['pikafish-xiangqi-strongest'],
    defaultGameSpecId: 'xiangqi',
  },
  {
    id: 'fairy-stockfish-mini-xiangqi-amateur',
    displayName: 'Fairy Stockfish - Amateur',
    activeEngineId: 'fairy-stockfish-mini-xiangqi-amateur',
    defaultGameSpecId: 'mini-xiangqi',
  },
  {
    id: 'fairy-stockfish-mini-xiangqi',
    displayName: 'Fairy Stockfish - Strong',
    activeEngineId: 'fairy-stockfish-mini-xiangqi-strong',
    defaultGameSpecId: 'mini-xiangqi',
  },
  {
    id: 'fairy-stockfish-mini-xiangqi-strongest',
    displayName: 'Fairy Stockfish - Strongest',
    activeEngineId: 'fairy-stockfish-mini-xiangqi-very-strong',
    defaultGameSpecId: 'mini-xiangqi',
  },
];

const botByEngineId = new Map<string, FirstPartyBotProfile>();
const botById = new Map<string, FirstPartyBotProfile>();
for (const bot of FIRST_PARTY_BOT_PROFILES) {
  botById.set(bot.id, bot);
  botByEngineId.set(bot.activeEngineId, bot);
  for (const engineId of bot.attributionEngineIds ?? []) {
    botByEngineId.set(engineId, bot);
  }
}

export function firstPartyBotForId(botId: string): FirstPartyBotProfile | null {
  return botById.get(botId) ?? null;
}

export function firstPartyBotForEngine(engineId: string): FirstPartyBotProfile | null {
  return botByEngineId.get(engineId) ?? null;
}
