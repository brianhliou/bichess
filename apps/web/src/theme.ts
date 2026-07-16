import './theme.css';
import type { GameFamilyId } from '@mistboard/game';
import { type ConnectionStatus, createConnectionStatus } from './connection-status.js';
import { t } from './i18n/catalog.js';
import {
  currentLocale,
  LOCALE_META,
  type Locale,
  localizedHref,
  SUPPORTED_LOCALES,
  setStoredLocale,
} from './i18n/locale.js';
import {
  readStoredShogiBoardTheme,
  readStoredShogiPieceSet,
  SHOGI_BOARD_THEMES,
  type ShogiBoardTheme,
  writeStoredShogiBoardTheme,
  writeStoredShogiPieceSet,
} from './shogi-appearance-storage.js';
import { SHOGI_PIECE_SETS, type ShogiPieceSet, shogiPieceTilePreview } from './shogi-piece-sets.js';
import { isLikelySignedIn } from './signed-in-state.js';
import { readStoredSoundSet, SOUND_SETS, type SoundSetId, storeSoundSet } from './sound-sets.js';
import {
  readStoredXiangqiBoardLayout,
  readStoredXiangqiBoardTheme,
  readStoredXiangqiPieceSet,
  writeStoredXiangqiBoardLayout,
  writeStoredXiangqiBoardTheme,
  writeStoredXiangqiPieceSet,
  type XiangqiBoardLayout,
  type XiangqiBoardTheme,
} from './xiangqi-appearance-storage.js';
import {
  XIANGQI_PIECE_SETS,
  type XiangqiPieceSet,
  xiangqiPieceTilePreview,
} from './xiangqi-piece-sets.js';

export { readStoredShogiPieceSet } from './shogi-appearance-storage.js';
export {
  readStoredXiangqiBoardLayout,
  readStoredXiangqiPieceSet,
} from './xiangqi-appearance-storage.js';

export type BoardTheme = 'standard' | 'contrast' | 'colorblind' | 'blue' | 'green' | 'mono';
export type FogTheme = 'veil' | 'solid' | 'drift' | 'mistveil' | 'void' | 'invisible';
export type PieceSet = 'cburnett' | 'merida' | 'chessnut' | 'fantasy' | 'letter';
export type SiteTheme = 'system' | 'light' | 'dark';
// The appearance "family" is the GameSpec family (chess-family games share board
// themes + piece sets; likewise for xiangqi). Driven by gameSpecForId(id).family.
export type BoardFamily = GameFamilyId;

const siteThemeStorageKey = 'mistboard.siteTheme';
const boardStorageKey = 'mistboard.boardTheme';
const fogStorageKey = 'mistboard.fogTheme';
const pieceSetStorageKey = 'mistboard.pieceSet';
const soundVolumeStorageKey = 'mistboard.soundVolume';
const soundMutedStorageKey = 'mistboard.soundMuted';
export const soundSettingsChangedEvent = 'mistboard:sound-settings-changed';
export const siteThemeChangedEvent = 'mistboard:site-theme-changed';
export const boardAppearanceChangedEvent = 'mistboard:board-appearance-changed';
// Fired when a xiangqi-family appearance setting (board theme or piece set)
// changes. The xiangqi board renders pieces as inline SVG, so unlike the
// CSS-driven chess board it must re-render to pick up a new piece set.
export const xiangqiAppearanceChangedEvent = 'mistboard:xiangqi-appearance-changed';
// Fired when a shogi appearance setting (board theme or piece set) changes. Like
// xiangqi, the shogi board renders pieces as inline SVG, so it re-renders to pick
// up a new set rather than restyling through CSS.
export const shogiAppearanceChangedEvent = 'mistboard:shogi-appearance-changed';
const defaultSiteTheme: SiteTheme = 'system';
const defaultTheme: BoardTheme = 'green';
const defaultFogTheme: FogTheme = 'solid';
const defaultPieceSet: PieceSet = 'cburnett';
const defaultSoundVolume = 0.7;
let cachedSoundVolume = defaultSoundVolume;
let cachedSoundMuted = false;
export const siteThemeOptions: Array<{ id: SiteTheme; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const themes: Array<{ id: BoardTheme; label: string }> = [
  { id: 'green', label: 'Tournament' },
  { id: 'standard', label: 'Classic' },
  { id: 'blue', label: 'Blue' },
  { id: 'mono', label: 'Monochrome' },
  { id: 'contrast', label: 'High contrast' },
  { id: 'colorblind', label: 'Colorblind' },
];
const fogThemes: Array<{ id: FogTheme; label: string }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'veil', label: 'Veil' },
  { id: 'mistveil', label: 'Mistveil' },
  { id: 'drift', label: 'Puff' },
  { id: 'void', label: 'Void' },
  { id: 'invisible', label: 'None' },
];
const pieceSets: Array<{ id: PieceSet; label: string }> = [
  { id: 'cburnett', label: 'Cburnett' },
  { id: 'merida', label: 'Merida' },
  { id: 'chessnut', label: 'Chessnut' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'letter', label: 'Letter' },
];
const xiangqiBoardThemes: Array<{ id: XiangqiBoardTheme; label: string }> = [
  { id: 'international', label: 'International' },
  { id: 'traditional', label: 'Traditional' },
];
type XiangqiBoardChoice = XiangqiBoardTheme | 'cell';
const xiangqiBoardChoices: Array<{ id: XiangqiBoardChoice; label: string }> = [
  ...xiangqiBoardThemes,
  { id: 'cell', label: 'Square grid' },
];
const xiangqiPieceSets = XIANGQI_PIECE_SETS;
const shogiBoardThemes = SHOGI_BOARD_THEMES;
const shogiPieceSets = SHOGI_PIECE_SETS;
const defaultBoardFamily: BoardFamily = 'xiangqi';

// Xiangqi appearance (board themes + piece sets) is shared by full Dark Xiangqi,
// Dark Mini Xiangqi, Mini Xiangqi, and Crossroads Chess's xiangqi-side disk
// pieces. These variants are baseline surfaces, so the family controls are
// always available.
export function xiangqiAppearanceEnabled(): boolean {
  return true;
}

// Shogi is no longer a player-facing game family. Keep its render/storage
// support available to historical surfaces, but do not advertise controls for
// a game that cannot be selected from the product.
export function shogiAppearanceEnabled(): boolean {
  return false;
}

function enabledAppearanceFamilies(): Array<{ id: BoardFamily; label: string }> {
  return [
    ...(xiangqiAppearanceEnabled() ? [{ id: 'xiangqi' as BoardFamily, label: 'Xiangqi' }] : []),
    { id: 'chess', label: 'Chess' },
    ...(shogiAppearanceEnabled() ? [{ id: 'shogi' as BoardFamily, label: 'Shogi' }] : []),
  ];
}
let navObserver: MutationObserver | null = null;
let systemThemeWatcherBound = false;
const statusByThemeControl = new WeakMap<HTMLElement, ConnectionStatus>();

export function initializeThemeSettings(): void {
  applySiteTheme(readStoredSiteTheme());
  applyBoardTheme(readStoredTheme());
  applyFogTheme(readStoredFogTheme());
  applyPieceSet(readStoredPieceSet());
  applyXiangqiBoardLayout(readStoredXiangqiBoardLayout());
  applyXiangqiBoardTheme(readStoredXiangqiBoardTheme());
  applyXiangqiPieceSet(readStoredXiangqiPieceSet());
  applyShogiBoardTheme(readStoredShogiBoardTheme());
  applyShogiPieceSet(readStoredShogiPieceSet());
  if (!document.documentElement.dataset.boardFamily) {
    document.documentElement.dataset.boardFamily = defaultBoardFamily;
  }
  watchForSystemThemeChanges();
  mountThemeControls();
  watchForNavChanges();
}

// Set by the active route so the settings panel shows the right board/piece
// pickers (chess vs xiangqi). The fog picker is shared across both families.
export function setBoardFamily(family: BoardFamily): void {
  document.documentElement.dataset.boardFamily = family;
  syncBoardFamilyControls();
}

function currentBoardFamily(): BoardFamily {
  const value = document.documentElement.dataset.boardFamily;
  return enabledAppearanceFamilies().some((family) => family.id === value)
    ? (value as BoardFamily)
    : defaultBoardFamily;
}

function applySiteTheme(theme: SiteTheme): void {
  const resolved = resolveSiteTheme(theme);
  document.documentElement.dataset.siteTheme = theme;
  document.documentElement.dataset.effectiveTheme = resolved;
  document.documentElement.style.colorScheme = resolved;
  updateThemeColorMeta(resolved);
}

function applyBoardTheme(theme: BoardTheme): void {
  document.documentElement.dataset.boardTheme = theme;
}

function applyFogTheme(theme: FogTheme): void {
  document.documentElement.dataset.fogTheme = theme;
}

function applyPieceSet(pieceSet: PieceSet): void {
  document.documentElement.dataset.pieceSet = pieceSet;
}

function applyXiangqiBoardTheme(theme: XiangqiBoardTheme): void {
  document.documentElement.dataset.xiangqiBoardTheme = theme;
}

function applyXiangqiBoardLayout(layout: XiangqiBoardLayout): void {
  document.documentElement.dataset.xiangqiBoardLayout = layout;
}

function applyXiangqiPieceSet(pieceSet: XiangqiPieceSet): void {
  document.documentElement.dataset.xiangqiPieceSet = pieceSet;
}

function applyShogiBoardTheme(theme: ShogiBoardTheme): void {
  document.documentElement.dataset.shogiBoardTheme = theme;
}

function applyShogiPieceSet(pieceSet: ShogiPieceSet): void {
  document.documentElement.dataset.shogiPieceSet = pieceSet;
}

function mountThemeControls(): void {
  for (const control of document.querySelectorAll<HTMLElement>('body > [data-theme-control]')) {
    control.remove();
  }
  for (const nav of document.querySelectorAll<HTMLElement>('.site-nav')) {
    mountThemeControl(nav);
  }
}

function watchForNavChanges(): void {
  if (navObserver) return;
  navObserver = new MutationObserver(() => mountThemeControls());
  navObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', closeThemeMenusOnOutsideClick);
  document.addEventListener('keydown', closeThemeMenusOnEscape);
}

// The single canonical settings gear: 8-spoke, filled (the lichess dasher
// affordance). Every gear in the app renders through this — the signed-out nav
// trigger here and the signed-in profile menu's Preferences row (account-nav.ts)
// — so the two never drift again (issue #139). `size` sets both width/height in
// px; the 24x24 viewBox is fixed.
export function gearIconSvg(size = 22): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" fill-rule="evenodd" aria-hidden="true" focusable="false"><path d="M13.6 2h-3.2l-.7 2.4c-.4.1-.8.3-1.1.5L6.4 3.7 3.9 6.2l1.2 2.2c-.2.4-.4.7-.5 1.1L2 10.3v3.4l2.6.8c.1.4.3.8.5 1.1l-1.2 2.2 2.5 2.5 2.2-1.2c.4.2.7.4 1.1.5l.7 2.4h3.2l.7-2.4c.4-.1.8-.3 1.1-.5l2.2 1.2 2.5-2.5-1.2-2.2c.2-.4.4-.7.5-1.1l2.6-.8v-3.4l-2.6-.8c-.1-.4-.3-.8-.5-1.1l1.2-2.2-2.5-2.5-2.2 1.2c-.4-.2-.7-.4-1.1-.5L13.6 2zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/></svg>`;
}

function mountThemeControl(nav: HTMLElement): void {
  // Signed in, the appearance panel folds into the profile dropdown
  // (account-nav.ts), so the standalone gear is not shown — matches lichess.
  if (isLikelySignedIn()) return;

  const target =
    nav.querySelector<HTMLElement>('.site-nav-utilities') ??
    nav.querySelector<HTMLElement>('.site-nav-links');
  if (!target) return;
  if (target.querySelector('[data-theme-control]')) return;

  const control = document.createElement('div');
  control.className = 'theme-control';
  control.dataset.themeControl = '';
  control.dataset.themeControlView = 'root';
  control.setAttribute('aria-label', 'Display and sound settings');

  const trigger = document.createElement('button');
  trigger.className = 'theme-control-trigger theme-control-trigger-icon';
  trigger.type = 'button';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Settings');
  trigger.title = 'Settings';
  // Canonical filled gear (see gearIconSvg), matching lichess's signed-out
  // settings affordance.
  trigger.innerHTML = gearIconSvg(22);

  const panel = document.createElement('div');
  panel.className = 'theme-control-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Display and sound settings');

  const status = createConnectionStatus();
  statusByThemeControl.set(control, status);

  panel.append(
    buildAppearanceMenu({
      includeLanguage: true,
      onViewChange: (view) => {
        control.dataset.themeControlView = view === 'root' ? 'root' : 'submenu';
      },
    }),
    createThemeDivider(),
    status.element,
  );

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    closeThemeMenus();
    if (!expanded) openThemeMenu(control);
  });

  control.append(trigger, panel);
  // Gear sits at the far right of the nav, after Sign in / Register (lichess order).
  target.append(control);
}

// The appearance controls as a lichess-style drill-in menu: a compact list of
// category rows (Appearance, Fog, Sound, Board, Pieces) that each open a
// sub-panel with that category's controls. Shared by the signed-out gear above
// and the signed-in profile dropdown (account-nav.ts), which embeds it directly
// so there's no standalone gear when logged in.
//
// Board + piece pickers are per game family. When a xiangqi variant is enabled a
// Game selector sits above the Board/Pieces rows and scopes which family's tiles
// the sub-panels show (the family-gating CSS hides the inactive family). On a
// chess-only build there's no selector and the menu mirrors a single-game setup.
type AppearanceMenuOptions = {
  includeLanguage?: boolean;
  // Called with the picked locale before the page navigates to the localized
  // URL. The signed-in dropdown uses it to persist the choice to the account.
  onLocaleSelect?: (locale: Locale) => void;
  // Lets an embedding menu, such as the signed-in account dropdown, replace its
  // whole surface when the appearance menu drills into a sub-panel.
  onViewChange?: (view: string) => void;
};

export function buildAppearanceMenu(options: AppearanceMenuOptions = {}): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'appearance-menu';
  const locale = currentLocale();

  const root = document.createElement('div');
  root.className = 'appearance-menu-root';
  const submenus: HTMLElement[] = [];

  const addCategory = (key: string, label: string, body: HTMLElement[]): void => {
    root.append(createAppearanceRow(key, label));
    submenus.push(createAppearanceSubmenu(key, label, body));
  };

  // Row order mirrors the lichess dasher (Language, Sound, Appearance, Board,
  // Piece set); Fog is our one addition and sits last. The per-game Board/Piece
  // pickers carry the Game family selector inside their own sub-panel, so the
  // root stays a narrow list of rows.
  if (options.includeLanguage) {
    addCategory('language', t('nav.language', {}, locale), [
      createLanguageField(locale, options.onLocaleSelect),
    ]);
  }
  addCategory('sound', t('prefs.sound', {}, locale), [createSoundPanel()]);
  addCategory('theme', t('prefs.appearance', {}, locale), [createSiteThemeList()]);

  // The Game selector only appears when a xiangqi variant is enabled; otherwise
  // Board/Pieces drill straight into the chess tiles. It sits at the top of both
  // the Board and Pieces sub-panels; all instances share one family via the
  // documentElement dataset and syncBoardFamilyControls.
  const boardBody: HTMLElement[] = [];
  if (xiangqiAppearanceEnabled()) boardBody.push(createBoardFamilyField('stacked'));
  boardBody.push(
    createTileField(
      'board',
      t('prefs.boardColors', {}, locale),
      t('prefs.boardColorScheme', {}, locale),
      themes,
      readStoredTheme(),
      (value) => {
        applyBoardTheme(value);
        writeStoredTheme(value);
        syncThemeControls();
        dispatchBoardAppearanceChanged();
      },
      'chess',
      false,
    ),
  );
  if (xiangqiAppearanceEnabled()) {
    boardBody.push(
      createTileField(
        'xqboard',
        t('prefs.boardStyle', {}, locale),
        t('prefs.xiangqiBoardPresentation', {}, locale),
        xiangqiBoardChoices,
        readXiangqiBoardChoice(),
        (value) => {
          if (value !== 'cell') {
            applyXiangqiBoardTheme(value);
            writeStoredXiangqiBoardTheme(value);
          }
          const layout: XiangqiBoardLayout = value === 'cell' ? 'cell' : 'intersection';
          applyXiangqiBoardLayout(layout);
          writeStoredXiangqiBoardLayout(layout);
          syncThemeControls();
          dispatchXiangqiAppearanceChanged();
        },
        'xiangqi',
        false,
      ),
    );
  }
  if (shogiAppearanceEnabled()) {
    boardBody.push(
      createTileField(
        'shogiboard',
        t('prefs.boardColors', {}, locale),
        t('prefs.shogiBoardColorScheme', {}, locale),
        shogiBoardThemes,
        readStoredShogiBoardTheme(),
        (value) => {
          applyShogiBoardTheme(value);
          writeStoredShogiBoardTheme(value);
          syncThemeControls();
          dispatchShogiAppearanceChanged();
        },
        'shogi',
        false,
      ),
    );
  }
  addCategory('board', t('prefs.board', {}, locale), boardBody);

  const pieceBody: HTMLElement[] = [];
  if (xiangqiAppearanceEnabled()) pieceBody.push(createBoardFamilyField('stacked'));
  pieceBody.push(
    createTileField(
      'piece',
      t('prefs.pieces', {}, locale),
      t('prefs.pieceSet', {}, locale),
      pieceSets,
      readStoredPieceSet(),
      (value) => {
        applyPieceSet(value);
        writeStoredPieceSet(value);
        syncThemeControls();
        dispatchBoardAppearanceChanged();
      },
      'chess',
      false,
    ),
  );
  if (xiangqiAppearanceEnabled()) {
    pieceBody.push(
      createTileField(
        'xqpiece',
        t('prefs.pieces', {}, locale),
        t('prefs.xiangqiPieceSet', {}, locale),
        xiangqiPieceSets,
        readStoredXiangqiPieceSet(),
        (value) => {
          applyXiangqiPieceSet(value);
          writeStoredXiangqiPieceSet(value);
          syncThemeControls();
          dispatchXiangqiAppearanceChanged();
        },
        'xiangqi',
        false,
      ),
    );
  }
  if (shogiAppearanceEnabled()) {
    pieceBody.push(
      createTileField(
        'shogipiece',
        t('prefs.pieces', {}, locale),
        t('prefs.shogiPieceSet', {}, locale),
        shogiPieceSets,
        readStoredShogiPieceSet(),
        (value) => {
          applyShogiPieceSet(value);
          writeStoredShogiPieceSet(value);
          syncThemeControls();
          dispatchShogiAppearanceChanged();
        },
        'shogi',
        false,
      ),
    );
  }
  addCategory('pieces', t('prefs.pieces', {}, locale), pieceBody);

  // Fog is our one row beyond the lichess set; keep it last so the shared five
  // stay in lichess order above it.
  addCategory('fog', t('prefs.fog', {}, locale), [
    createTileField(
      'fog',
      t('prefs.fog', {}, locale),
      t('prefs.fogShadingStyle', {}, locale),
      fogThemes,
      readStoredFogTheme(),
      (value) => {
        applyFogTheme(value);
        writeStoredFogTheme(value);
        syncThemeControls();
        dispatchBoardAppearanceChanged();
      },
      undefined,
      false,
    ),
  ]);

  menu.append(root, ...submenus);

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-appearance-target]')) {
    button.addEventListener('click', () =>
      showAppearanceView(menu, button.dataset.appearanceTarget ?? 'root', options.onViewChange),
    );
  }
  for (const back of menu.querySelectorAll<HTMLButtonElement>('.appearance-submenu-back')) {
    back.addEventListener('click', () => showAppearanceView(menu, 'root', options.onViewChange));
  }
  showAppearanceView(menu, 'root', options.onViewChange);
  return menu;
}

function createAppearanceRow(key: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'appearance-menu-row';
  button.dataset.appearanceTarget = key;
  const text = document.createElement('span');
  text.textContent = label;
  const chevron = document.createElement('span');
  chevron.className = 'appearance-menu-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  button.append(text, chevron);
  return button;
}

function createAppearanceSubmenu(key: string, label: string, body: HTMLElement[]): HTMLDivElement {
  const sub = document.createElement('div');
  sub.className = 'appearance-submenu';
  sub.dataset.key = key;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'appearance-submenu-back';
  const arrow = document.createElement('span');
  arrow.className = 'appearance-submenu-back-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  const backText = document.createElement('span');
  backText.textContent = label;
  back.append(arrow, backText);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'appearance-submenu-body';
  bodyWrap.append(...body);

  sub.append(back, bodyWrap);
  return sub;
}

function createLanguageField(
  locale: Locale = currentLocale(),
  onSelect?: (locale: Locale) => void,
): HTMLDivElement {
  const list = document.createElement('div');
  list.className = 'appearance-language-list';
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', t('nav.language', {}, locale));

  for (const optionLocale of SUPPORTED_LOCALES) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'appearance-language-option';
    option.dataset.locale = optionLocale;
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(optionLocale === locale));
    option.textContent = LOCALE_META[optionLocale].displayName;
    if (optionLocale === locale) option.classList.add('selected');
    option.addEventListener('click', () => {
      onSelect?.(optionLocale);
      setStoredLocale(optionLocale);
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = localizedHref(currentHref, optionLocale);
    });
    list.append(option);
  }

  return list;
}

function createThemeDivider(): HTMLDivElement {
  const divider = document.createElement('div');
  divider.className = 'account-nav-divider theme-control-divider';
  divider.setAttribute('role', 'separator');
  return divider;
}

// Drill state lives in the DOM (data-view + hidden), so multiple mounted menus
// (mobile + desktop nav, gear + dropdown) stay independent.
function showAppearanceView(
  menu: HTMLElement,
  view: string,
  onViewChange?: (view: string) => void,
): void {
  menu.dataset.view = view;
  const root = menu.querySelector<HTMLElement>('.appearance-menu-root');
  if (root) root.hidden = view !== 'root';
  for (const sub of menu.querySelectorAll<HTMLElement>('.appearance-submenu')) {
    sub.hidden = sub.dataset.key !== view;
  }
  onViewChange?.(view);
}

// Return every mounted appearance menu to its root list. Called when a parent
// dropdown opens so it never reopens mid-drill on a stale sub-panel.
export function resetAppearanceMenus(root: ParentNode = document): void {
  for (const menu of root.querySelectorAll<HTMLElement>('.appearance-menu')) {
    showAppearanceView(menu, 'root');
  }
}

function createSiteThemeList(): HTMLDivElement {
  const list = document.createElement('div');
  list.className = 'appearance-choice-list appearance-theme-list';
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', 'Site appearance');

  for (const option of siteThemeOptions) {
    list.append(createSiteThemeButton(option.id, siteThemeMenuLabel(option.id)));
  }

  return list;
}

function createSiteThemeButton(theme: SiteTheme, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'appearance-choice-option';
  button.dataset.siteThemeOption = theme;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(readStoredSiteTheme() === theme));
  button.textContent = label;
  if (readStoredSiteTheme() === theme) button.classList.add('selected');
  button.addEventListener('click', () => setSiteThemePreference(theme));
  return button;
}

function siteThemeMenuLabel(theme: SiteTheme): string {
  if (theme === 'system') return 'Device theme';
  return siteThemeOptions.find((option) => option.id === theme)?.label ?? theme;
}

// Picks which game family's board + piece pickers are shown. The options sit as
// a segmented toggle (no nested dropdown to open). Defaults to the active page's
// family (set by the route via setBoardFamily); switching it lets you configure
// another family's appearance. The 'stacked' layout (label above a full-width
// 3-up toggle) is used inside the Board/Pieces sub-panels; 'inline' keeps the
// label and toggle on one row for a compact standalone field.
function createBoardFamilyField(layout: 'inline' | 'stacked' = 'inline'): HTMLDivElement {
  const field = document.createElement('div');
  field.className =
    layout === 'stacked' ? 'theme-control-field' : 'theme-control-field theme-control-field-inline';
  field.classList.add('theme-control-family-field');
  const text = document.createElement('span');
  text.textContent = 'Game';

  const group = document.createElement('div');
  group.className =
    layout === 'stacked'
      ? 'theme-control-segmented theme-control-segmented-block'
      : 'theme-control-segmented';
  group.dataset.boardFamilySelect = '';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Board and piece game family');
  const active = currentBoardFamily();
  for (const family of enabledAppearanceFamilies()) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'theme-mode-option';
    option.dataset.boardFamilyOption = family.id;
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(family.id === active));
    option.textContent = family.label;
    if (family.id === active) option.classList.add('selected');
    option.addEventListener('click', () => setBoardFamily(family.id));
    group.append(option);
  }

  field.append(text, group);
  return field;
}

function syncBoardFamilyControls(): void {
  const active = currentBoardFamily();
  document.querySelectorAll<HTMLElement>('[data-board-family-select]').forEach((group) => {
    for (const option of group.querySelectorAll<HTMLButtonElement>('[data-board-family-option]')) {
      const selected = option.dataset.boardFamilyOption === active;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-checked', String(selected));
    }
  });
}

type TileKind = 'board' | 'fog' | 'piece' | 'xqboard' | 'xqpiece' | 'shogiboard' | 'shogipiece';

function createTileField<T extends string>(
  kind: TileKind,
  label: string,
  ariaLabel: string,
  options: ReadonlyArray<{ id: T; label: string }>,
  value: T,
  onChange: (value: T) => void,
  family?: BoardFamily,
  showLabel = true,
): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'theme-control-field';
  if (family) field.dataset.appearanceFamily = family;

  const row = document.createElement('div');
  row.className = 'theme-tile-row';
  row.dataset.themeTileRow = kind;
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', ariaLabel);

  for (const option of options) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'theme-tile';
    tile.dataset.themeTile = kind;
    tile.dataset.id = option.id;
    tile.setAttribute('role', 'radio');
    tile.setAttribute('aria-checked', String(option.id === value));
    tile.setAttribute('aria-label', option.label);
    tile.title = option.label;
    if (option.id === value) tile.classList.add('selected');

    const preview = document.createElement('span');
    preview.className = `theme-tile-preview theme-tile-preview-${kind}`;
    preview.dataset.id = option.id;
    // Xiangqi / shogi piece tiles show a representative mark; the board tiles use
    // a CSS color swatch like the chess board tiles.
    if (kind === 'xqpiece') {
      const xiangqiPreview = xiangqiPieceTilePreview(option.id as XiangqiPieceSet);
      if (xiangqiPreview.kind === 'svg') {
        preview.innerHTML = xiangqiPreview.markup;
      } else {
        preview.textContent = xiangqiPreview.text;
      }
    } else if (kind === 'shogipiece') {
      const shogiPreview = shogiPieceTilePreview(option.id as ShogiPieceSet);
      if (shogiPreview.kind === 'image') {
        const img = document.createElement('img');
        img.src = shogiPreview.href;
        img.alt = '';
        img.loading = 'lazy';
        preview.append(img);
      } else {
        preview.textContent = shogiPreview.text;
      }
    }
    tile.append(preview);

    tile.addEventListener('click', () => onChange(option.id));
    row.append(tile);
  }

  if (showLabel) {
    const text = document.createElement('span');
    text.textContent = label;
    field.append(text);
  }
  field.append(row);
  return field;
}

function createSoundPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'appearance-sound-panel';

  const volume = createVolumeField();
  volume.classList.add('appearance-sound-volume');

  const list = document.createElement('div');
  list.className = 'appearance-choice-list appearance-sound-list';
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', t('prefs.soundSet'));

  for (const set of SOUND_SETS) {
    list.append(createSoundOption(set.id, set.label));
  }
  list.append(createSoundOption('silent', t('prefs.silent')));

  panel.append(volume, list);
  return panel;
}

function createVolumeField(): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'theme-control-field theme-control-volume-field';
  const row = document.createElement('span');
  row.className = 'theme-control-field-row';
  const label = document.createElement('span');
  label.textContent = t('prefs.volume');
  const value = document.createElement('output');
  value.dataset.soundVolumeValue = '';
  value.textContent = readStoredSoundMuted() ? 'Muted' : formatVolume(readEffectiveSoundVolume());
  row.append(label, value);

  if (readStoredSoundMuted()) field.classList.add('muted');

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.value = String(Math.round(readEffectiveSoundVolume() * 100));
  input.dataset.soundVolume = '';
  input.setAttribute('aria-label', 'Sound volume');
  input.addEventListener('input', () => {
    const nextVolume = normalizeVolume(Number(input.value) / 100);
    writeStoredSoundVolume(nextVolume);
    if (nextVolume > 0 && readStoredSoundMuted()) {
      writeStoredSoundMuted(false);
    }
    dispatchSoundSettingsChanged();
    syncThemeControls();
  });

  field.append(row, input);
  return field;
}

function createSoundOption(id: SoundSetId | 'silent', label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'appearance-choice-option';
  button.dataset.soundOption = id;
  button.setAttribute('role', 'radio');
  const selected = readStoredSoundMuted() ? id === 'silent' : id === readStoredSoundSet();
  button.setAttribute('aria-checked', String(selected));
  button.textContent = label;
  if (selected) button.classList.add('selected');
  button.addEventListener('click', () => {
    if (id === 'silent') {
      writeStoredSoundMuted(true);
      dispatchSoundSettingsChanged();
    } else {
      storeSoundSet(id);
      if (readStoredSoundMuted()) {
        writeStoredSoundMuted(false);
        dispatchSoundSettingsChanged();
      }
    }
    syncThemeControls();
  });
  return button;
}

function openThemeMenu(control: HTMLElement): void {
  resetAppearanceMenus(control);
  control.classList.add('open');
  control
    .querySelector<HTMLButtonElement>('.theme-control-trigger')
    ?.setAttribute('aria-expanded', 'true');
  statusByThemeControl.get(control)?.start();
}

function closeThemeMenus(): void {
  document.querySelectorAll<HTMLElement>('[data-theme-control]').forEach((control) => {
    control.classList.remove('open');
    control
      .querySelector<HTMLButtonElement>('.theme-control-trigger')
      ?.setAttribute('aria-expanded', 'false');
    statusByThemeControl.get(control)?.stop();
  });
}

function closeThemeMenusOnOutsideClick(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-theme-control]')) return;
  closeThemeMenus();
}

function closeThemeMenusOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeThemeMenus();
}

function syncThemeControls(): void {
  const siteTheme = readStoredSiteTheme();
  const boardTheme = readStoredTheme();
  const fogTheme = readStoredFogTheme();
  const pieceSet = readStoredPieceSet();
  const soundMuted = readStoredSoundMuted();
  const effectiveVolume = readEffectiveSoundVolume();
  syncSiteThemeControls(siteTheme);
  syncBoardFamilyControls();
  syncTileRow('board', boardTheme);
  syncTileRow('xqboard', readXiangqiBoardChoice());
  syncTileRow('shogiboard', readStoredShogiBoardTheme());
  syncTileRow('fog', fogTheme);
  syncTileRow('piece', pieceSet);
  syncTileRow('xqpiece', readStoredXiangqiPieceSet());
  syncTileRow('shogipiece', readStoredShogiPieceSet());
  document.querySelectorAll<HTMLInputElement>('input[data-sound-volume]').forEach((input) => {
    input.value = String(Math.round(effectiveVolume * 100));
  });
  document.querySelectorAll<HTMLButtonElement>('button[data-sound-option]').forEach((button) => {
    const id = button.dataset.soundOption;
    const isActive = soundMuted ? id === 'silent' : id === readStoredSoundSet();
    button.setAttribute('aria-checked', String(isActive));
    button.classList.toggle('selected', isActive);
  });
  document
    .querySelectorAll<HTMLOutputElement>('output[data-sound-volume-value]')
    .forEach((output) => {
      output.textContent = soundMuted ? 'Muted' : formatVolume(effectiveVolume);
    });
  document.querySelectorAll<HTMLElement>('.theme-control-volume-field').forEach((field) => {
    field.classList.toggle('muted', soundMuted);
  });
}

function readXiangqiBoardChoice(): XiangqiBoardChoice {
  return readStoredXiangqiBoardLayout() === 'cell' ? 'cell' : readStoredXiangqiBoardTheme();
}

function syncSiteThemeControls(activeTheme: SiteTheme): void {
  document
    .querySelectorAll<HTMLButtonElement>('button[data-site-theme-option]')
    .forEach((button) => {
      const isActive = button.dataset.siteThemeOption === activeTheme;
      button.setAttribute('aria-checked', String(isActive));
      button.classList.toggle('selected', isActive);
    });
}

function syncTileRow(kind: TileKind, activeId: string): void {
  document
    .querySelectorAll<HTMLButtonElement>(`button[data-theme-tile="${kind}"]`)
    .forEach((tile) => {
      const isActive = tile.dataset.id === activeId;
      tile.setAttribute('aria-checked', String(isActive));
      tile.classList.toggle('selected', isActive);
    });
}

export function setSiteThemePreference(theme: SiteTheme): void {
  const normalized = normalizeSiteTheme(theme);
  applySiteTheme(normalized);
  writeStoredSiteTheme(normalized);
  syncThemeControls();
  window.dispatchEvent(new Event(siteThemeChangedEvent));
}

export function readStoredSiteTheme(): SiteTheme {
  try {
    return normalizeSiteTheme(window.localStorage.getItem(siteThemeStorageKey));
  } catch {
    return defaultSiteTheme;
  }
}

function writeStoredSiteTheme(theme: SiteTheme): void {
  try {
    window.localStorage.setItem(siteThemeStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function readStoredTheme(): BoardTheme {
  try {
    return normalizeTheme(window.localStorage.getItem(boardStorageKey));
  } catch {
    return defaultTheme;
  }
}

function writeStoredTheme(theme: BoardTheme): void {
  try {
    window.localStorage.setItem(boardStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function readStoredFogTheme(): FogTheme {
  try {
    return normalizeFogTheme(window.localStorage.getItem(fogStorageKey));
  } catch {
    return defaultFogTheme;
  }
}

function writeStoredFogTheme(theme: FogTheme): void {
  try {
    window.localStorage.setItem(fogStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

export function readStoredPieceSet(): PieceSet {
  try {
    return normalizePieceSet(window.localStorage.getItem(pieceSetStorageKey));
  } catch {
    return defaultPieceSet;
  }
}

function writeStoredPieceSet(pieceSet: PieceSet): void {
  try {
    window.localStorage.setItem(pieceSetStorageKey, pieceSet);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function dispatchXiangqiAppearanceChanged(): void {
  window.dispatchEvent(new Event(xiangqiAppearanceChangedEvent));
  dispatchBoardAppearanceChanged();
}

function dispatchShogiAppearanceChanged(): void {
  // Only the shogi-specific event — NOT the chess-wide boardAppearanceChangedEvent
  // — so a shogi set/theme change re-renders only the shogi surfaces (live board,
  // postgame, rules diagrams) and never refreshes the chess variant rail (which
  // would re-floor and visibly shrink its thumbnails).
  window.dispatchEvent(new Event(shogiAppearanceChangedEvent));
}

function dispatchBoardAppearanceChanged(): void {
  window.dispatchEvent(new Event(boardAppearanceChangedEvent));
}

export function readEffectiveSoundVolume(): number {
  return readStoredSoundMuted() ? 0 : readStoredSoundVolume();
}

function readStoredSoundVolume(): number {
  try {
    cachedSoundVolume = normalizeVolume(window.localStorage.getItem(soundVolumeStorageKey));
    return cachedSoundVolume;
  } catch {
    return cachedSoundVolume;
  }
}

function writeStoredSoundVolume(volume: number): void {
  cachedSoundVolume = normalizeVolume(volume);
  try {
    window.localStorage.setItem(soundVolumeStorageKey, String(cachedSoundVolume));
  } catch {
    // Sound settings still update for the current page.
  }
}

function readStoredSoundMuted(): boolean {
  try {
    cachedSoundMuted = window.localStorage.getItem(soundMutedStorageKey) === 'true';
    return cachedSoundMuted;
  } catch {
    return cachedSoundMuted;
  }
}

function writeStoredSoundMuted(muted: boolean): void {
  cachedSoundMuted = muted;
  try {
    window.localStorage.setItem(soundMutedStorageKey, muted ? 'true' : 'false');
  } catch {
    // Sound settings still update for the current page.
  }
}

function dispatchSoundSettingsChanged(): void {
  window.dispatchEvent(new Event(soundSettingsChangedEvent));
}

function watchForSystemThemeChanges(): void {
  if (systemThemeWatcherBound || !window.matchMedia) return;
  systemThemeWatcherBound = true;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', () => {
    if (readStoredSiteTheme() !== 'system') return;
    applySiteTheme('system');
    syncThemeControls();
    window.dispatchEvent(new Event(siteThemeChangedEvent));
  });
}

function resolveSiteTheme(theme: SiteTheme): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function updateThemeColorMeta(theme: 'light' | 'dark'): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  meta.content = theme === 'dark' ? '#121615' : '#ebefee';
}

function normalizeSiteTheme(value: string | null): SiteTheme {
  return siteThemeOptions.some((theme) => theme.id === value)
    ? (value as SiteTheme)
    : defaultSiteTheme;
}

function normalizeTheme(value: string | null): BoardTheme {
  return themes.some((theme) => theme.id === value) ? (value as BoardTheme) : defaultTheme;
}

function normalizeFogTheme(value: string | null): FogTheme {
  if (value === 'soft' || value === 'hatched') return 'solid';
  return fogThemes.some((theme) => theme.id === value) ? (value as FogTheme) : defaultFogTheme;
}

function normalizePieceSet(value: string | null): PieceSet {
  return pieceSets.some((set) => set.id === value) ? (value as PieceSet) : defaultPieceSet;
}

function normalizeVolume(value: string | number | null): number {
  if (value === null) return defaultSoundVolume;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return defaultSoundVolume;
  return Math.min(1, Math.max(0, parsed));
}

function formatVolume(volume: number): string {
  return `${Math.round(normalizeVolume(volume) * 100)}%`;
}
