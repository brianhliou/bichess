// The appearance/sound settings-panel UI: the lichess-style drill-in menu the
// signed-out nav gear and the signed-in profile dropdown (account-nav.ts) share.
//
// This module is loaded LAZILY (dynamic import from theme.ts, on first gear
// interaction or when a dropdown embeds the menu) so its builders and the piece
// tile previews stay out of the entry chunk. theme.ts keeps the applied-theme
// bootstrap, the storage readers, the change events, and the high-level
// preference setters this panel calls — the panel is a dumb view over that API.
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
} from './shogi-appearance-storage.js';
import { SHOGI_PIECE_SETS, type ShogiPieceSet, shogiPieceTilePreview } from './shogi-piece-sets.js';
import { readStoredSoundSet, SOUND_SETS, type SoundSetId } from './sound-sets.js';
import {
  type AppearanceMenuOptions,
  type BoardFamily,
  boardThemes,
  currentBoardFamily,
  enabledAppearanceFamilies,
  fogThemes,
  formatVolume,
  pieceSets,
  readEffectiveSoundVolume,
  readStoredFogTheme,
  readStoredPieceSet,
  readStoredSiteTheme,
  readStoredSoundMuted,
  readStoredTheme,
  readXiangqiBoardChoice,
  type SiteTheme,
  setBoardFamily,
  setBoardThemePreference,
  setFogThemePreference,
  setPieceSetPreference,
  setShogiBoardThemePreference,
  setShogiPieceSetPreference,
  setSiteThemePreference,
  setSoundSetPreference,
  setSoundVolumePreference,
  setXiangqiBoardChoicePreference,
  setXiangqiPieceSetPreference,
  shogiAppearanceEnabled,
  showAppearanceView,
  siteThemeOptions,
  type TileKind,
  type XiangqiBoardChoice,
  xiangqiAppearanceEnabled,
} from './theme.js';
import { readStoredXiangqiPieceSet, type XiangqiBoardTheme } from './xiangqi-appearance-storage.js';
import {
  XIANGQI_PIECE_SETS,
  type XiangqiPieceSet,
  xiangqiPieceTilePreview,
} from './xiangqi-piece-sets.js';

const xiangqiBoardThemes: Array<{ id: XiangqiBoardTheme; label: string }> = [
  { id: 'international', label: 'International' },
  { id: 'traditional', label: 'Traditional' },
];
const xiangqiBoardChoices: Array<{ id: XiangqiBoardChoice; label: string }> = [
  ...xiangqiBoardThemes,
  { id: 'cell', label: 'Square grid' },
];

// Fills the signed-out gear's dropdown panel: the shared appearance menu, a
// divider, and the connection-status footer. Returns the status so theme.ts can
// start/stop its polling with the menu's open state.
export function populateThemeControlPanel(
  control: HTMLElement,
  panel: HTMLElement,
): ConnectionStatus {
  const status = createConnectionStatus();
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
  return status;
}

// The appearance controls as a lichess-style drill-in menu: a compact list of
// category rows (Appearance, Fog, Sound, Board, Pieces) that each open a
// sub-panel with that category's controls. Shared by the signed-out gear above
// and the signed-in profile dropdown (account-nav.ts, through the lazy facade
// in theme.ts), which embeds it directly so there's no standalone gear when
// logged in.
//
// Board + piece pickers are per game family. When a xiangqi variant is enabled a
// Game selector sits above the Board/Pieces rows and scopes which family's tiles
// the sub-panels show (the family-gating CSS hides the inactive family). On a
// chess-only build there's no selector and the menu mirrors a single-game setup.
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
      boardThemes,
      readStoredTheme(),
      setBoardThemePreference,
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
        setXiangqiBoardChoicePreference,
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
        SHOGI_BOARD_THEMES,
        readStoredShogiBoardTheme(),
        setShogiBoardThemePreference,
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
      setPieceSetPreference,
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
        XIANGQI_PIECE_SETS,
        readStoredXiangqiPieceSet(),
        setXiangqiPieceSetPreference,
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
        SHOGI_PIECE_SETS,
        readStoredShogiPieceSet(),
        setShogiPieceSetPreference,
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
      setFogThemePreference,
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
    setSoundVolumePreference(Number(input.value) / 100);
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
  button.addEventListener('click', () => setSoundSetPreference(id));
  return button;
}
