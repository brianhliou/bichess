// Xiangqi Learn — copy table. Chrome/shared strings live here; every stage's
// strings live in its own stage file (stage.copy) and are merged in at load,
// so parallel stage authoring never edits this file. Keys are shaped like
// i18n catalog entries ('learn.xiangqi.*') so folding the merged table into
// apps/web/src/i18n/catalog.ts later is a mechanical move. House style: no em
// dashes in user-facing copy.

import { learnXiangqiStages } from './stages/index.js';

const CHROME_COPY: Record<string, string> = {
  // Chrome
  'learn.xiangqi.title': 'Learn xiangqi',
  'learn.xiangqi.byPlaying': 'by playing!',
  'learn.xiangqi.progress': 'Progress',
  'learn.xiangqi.resetProgress': 'Reset my progress',
  'learn.xiangqi.resetConfirm': 'You will lose all your progress. Reset anyway?',
  'learn.xiangqi.menu': 'Menu',
  'learn.xiangqi.backToMenu': 'Back to menu',
  'learn.xiangqi.play': 'Play',
  'learn.xiangqi.retry': 'Retry',
  'learn.xiangqi.next': 'Next',
  'learn.xiangqi.nextStage': 'Next:',
  'learn.xiangqi.levelFailed': 'Level failed',
  'learn.xiangqi.stage': 'Stage',
  'learn.xiangqi.stageComplete': 'complete',
  'learn.xiangqi.yourScore': 'Your score:',
  'learn.xiangqi.letsGo': "Let's go!",
  'learn.xiangqi.whatNext': 'What next?',
  'learn.xiangqi.whatNextCopy':
    'You know how to play xiangqi, congratulations! Ready to become a stronger player?',

  // Categories
  'learn.xiangqi.categ.pieces': 'Xiangqi pieces',
  'learn.xiangqi.categ.fundamentals': 'Fundamentals',
  'learn.xiangqi.categ.intermediate': 'Intermediate',
  'learn.xiangqi.categ.advanced': 'Advanced',

  // Congrats pool (one shown at random per solved level)
  'learn.xiangqi.congrats.1': 'Nice!',
  'learn.xiangqi.congrats.2': 'Excellent!',
  'learn.xiangqi.congrats.3': 'Great job!',
  'learn.xiangqi.congrats.4': 'Perfect!',
  'learn.xiangqi.congrats.5': 'Outstanding!',
  'learn.xiangqi.congrats.6': 'Way to go!',
  'learn.xiangqi.congrats.7': 'Yes, yes, yes!',
  'learn.xiangqi.congrats.8': "You're good at this!",

  // Shared goals
  'learn.xiangqi.goal.grabAllTheStars': 'Grab all the stars!',
};

let merged: Record<string, string> | null = null;

function table(): Record<string, string> {
  if (!merged) {
    merged = { ...CHROME_COPY };
    for (const stage of learnXiangqiStages) Object.assign(merged, stage.copy);
  }
  return merged;
}

export function learnCopy(key: string): string {
  return table()[key] ?? key;
}

export function learnCongrats(): string {
  const index = 1 + Math.floor(Math.random() * 8);
  return learnCopy(`learn.xiangqi.congrats.${index}`);
}
