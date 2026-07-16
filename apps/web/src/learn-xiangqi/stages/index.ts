// Xiangqi Learn — stage registry. Categories and stage order are the blessed
// curriculum (docs-private/xiangqi-learn-track.md §3); stage ids are assigned
// here sequentially, so INSERTING a stage renumbers ids. Ids are internal
// (hash routes use stage keys), so reordering is safe for saved progress —
// progress is keyed by stage key.

import type { LearnCategory, LearnStage } from '../learn-types.js';
import { toStage } from '../learn-types.js';
import { advisorStage } from './advisor.js';
import { cannonStage } from './cannon.js';
import { captureStage } from './capture.js';
import { chariotStage } from './chariot.js';
import { check1Stage } from './check1.js';
import { check2Stage } from './check2.js';
import { combatStage } from './combat.js';
import { elephantStage } from './elephant.js';
import { flyingGeneralStage } from './flying-general.js';
import { generalStage } from './general.js';
import { horseStage } from './horse.js';
import { matePatternsStage } from './mate-patterns.js';
import { mate1Stage } from './mate1.js';
import { outOfCheckStage } from './out-of-check.js';
import { perpetualStage } from './perpetual.js';
import { protectionStage } from './protection.js';
import { setupStage } from './setup.js';
import { soldierStage } from './soldier.js';
import { stalemateStage } from './stalemate.js';
import { valueStage } from './value.js';

interface RawCategory {
  key: string;
  name: string;
  stages: Parameters<typeof toStage>[0][];
}

const rawCategories: RawCategory[] = [
  {
    key: 'pieces',
    name: 'learn.xiangqi.categ.pieces',
    stages: [
      chariotStage,
      cannonStage,
      horseStage,
      elephantStage,
      advisorStage,
      generalStage,
      soldierStage,
    ],
  },
  {
    key: 'fundamentals',
    name: 'learn.xiangqi.categ.fundamentals',
    stages: [captureStage, protectionStage, combatStage, check1Stage, outOfCheckStage, mate1Stage],
  },
  {
    key: 'intermediate',
    name: 'learn.xiangqi.categ.intermediate',
    stages: [setupStage, flyingGeneralStage, stalemateStage, valueStage],
  },
  {
    key: 'advanced',
    name: 'learn.xiangqi.categ.advanced',
    stages: [check2Stage, matePatternsStage, perpetualStage],
  },
];

let nextId = 1;
export const learnXiangqiCategories: LearnCategory[] = rawCategories.map((categ) => ({
  key: categ.key,
  name: categ.name,
  stages: categ.stages.map((stage) => toStage(stage, nextId++)),
}));

export const learnXiangqiStages: LearnStage[] = learnXiangqiCategories.flatMap(
  (categ) => categ.stages,
);

export function stageByKey(key: string): LearnStage | undefined {
  return learnXiangqiStages.find((stage) => stage.key === key);
}

export function stageAfter(stage: LearnStage): LearnStage | undefined {
  return learnXiangqiStages.find((candidate) => candidate.id === stage.id + 1);
}

export function totalLevelCount(): number {
  return learnXiangqiStages.reduce((sum, stage) => sum + stage.levels.length, 0);
}
