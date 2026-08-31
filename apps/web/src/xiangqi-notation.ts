// Web-side resolution of the xiangqi move-notation display preference to a
// concrete @mistboard/game formatter style. The stored preference is
// script-neutral ('chinese'); the locale picks the glyph set at resolve time
// so a zh-Hant reader sees 馬8進7 and everyone else 马8进7.

import type { XiangqiNotationStyle } from '@mistboard/game';
import { currentLocale } from './i18n/locale.js';
import {
  readStoredXiangqiNotation,
  type XiangqiNotationPreference,
} from './xiangqi-appearance-storage.js';

/**
 * Set by an embed whose host page has asked for one notation, mirroring
 * pinSiteTheme: an in-memory override, never written to storage. The embed runs
 * on mistboard.com's origin, so writing would silently change the reader's own
 * setting for the whole site from inside a third party's page.
 */
let notationOverride: XiangqiNotationPreference | null = null;

export function pinXiangqiNotation(preference: XiangqiNotationPreference): void {
  notationOverride = preference;
}

/** Fired (on window) after the stored notation preference changes; review
 *  surfaces relabel their move trees on it. */
export const xiangqiNotationChangedEvent = 'mistboard:xiangqi-notation-changed';

export function currentXiangqiNotationStyle(): XiangqiNotationStyle {
  switch (notationOverride ?? readStoredXiangqiNotation()) {
    case 'chinese':
      return currentLocale() === 'zh-Hant' ? 'chinese-traditional' : 'chinese-simplified';
    case 'wxf':
      return 'wxf';
    case 'iccs':
      return 'iccs';
    default:
      return 'coordinate';
  }
}
