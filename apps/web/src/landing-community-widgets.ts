import { buildSiteBox } from './site-box.js';
import { leaderboardVariants } from './variants.js';
import './landing-community-widgets.css';

type PublicStudy = {
  id: string;
  name: string;
  owner: { handle: string; displayName: string };
  chapterCount: number;
  likeCount: number;
};

type LeaderboardEntry = {
  handle: string;
  displayName: string;
  eloRating: number;
  provisional: boolean;
};

type Ladder = { variant: string; leaderboard: LeaderboardEntry[] };

export function buildLandingCommunityWidgets(options: { hydrate?: boolean } = {}): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'landing-community-strip';
  strip.append(buildStudyWidget(options), buildLeaderboardWidget(options));
  return strip;
}

function buildStudyWidget(options: { hydrate?: boolean }): HTMLElement {
  const { box, body } = buildSiteBox({ title: 'Popular studies', href: '/study' });
  box.classList.add('landing-study-widget', 'landing-community-widget');
  body.append(statusRow('Loading studies.'));
  if (options.hydrate !== false) void hydrateStudies(body);
  return box;
}

async function hydrateStudies(body: HTMLElement): Promise<void> {
  try {
    const response = await fetch('/api/studies/public', {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`public_studies_failed_${response.status}`);
    const { studies } = (await response.json()) as { studies: PublicStudy[] };
    body.replaceChildren(
      ...(studies.length > 0
        ? studies.map(studyRow)
        : [statusRow('No public studies yet. Make the first one.')]),
    );
  } catch {
    body.replaceChildren(statusRow('Studies unavailable.'));
  }
}

function studyRow(study: PublicStudy): HTMLElement {
  const row = document.createElement('a');
  row.className = 'site-box-row landing-study-row';
  row.href = `/study/${encodeURIComponent(study.id)}`;

  const main = document.createElement('span');
  main.className = 'landing-community-main';
  main.append(
    text('landing-community-name', study.name),
    text(
      'landing-community-meta',
      `${study.owner.displayName} · ${study.chapterCount} ${study.chapterCount === 1 ? 'chapter' : 'chapters'}`,
    ),
  );
  const likes = text('landing-study-likes', `♥ ${study.likeCount}`);
  likes.title = `${study.likeCount} ${study.likeCount === 1 ? 'like' : 'likes'}`;
  row.append(main, likes);
  return row;
}

function buildLeaderboardWidget(options: { hydrate?: boolean }): HTMLElement {
  const { box, body } = buildSiteBox({ title: 'Top players', href: '/leaderboard' });
  box.classList.add('landing-leaderboard-widget', 'landing-community-widget');
  body.append(statusRow('Loading rankings.'));
  if (options.hydrate !== false) void hydrateLeaderboard(body);
  return box;
}

async function hydrateLeaderboard(body: HTMLElement): Promise<void> {
  try {
    const response = await fetch('/api/leaderboard/summary?limit=1', {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`leaderboard_widget_failed_${response.status}`);
    const { ladders } = (await response.json()) as { ladders: Ladder[] };
    const byVariant = new Map(ladders.map((ladder) => [ladder.variant, ladder.leaderboard[0]]));
    const rows = leaderboardVariants.flatMap((variant) => {
      const leader = byVariant.get(variant.id);
      return leader ? [leaderboardRow(variant.label, leader)] : [];
    });
    body.replaceChildren(...(rows.length > 0 ? rows : [statusRow('No rated players yet.')]));
  } catch {
    body.replaceChildren(statusRow('Rankings unavailable.'));
  }
}

function leaderboardRow(category: string, leader: LeaderboardEntry): HTMLElement {
  const row = document.createElement('a');
  row.className = 'site-box-row landing-leaderboard-row';
  row.href = `/@/${encodeURIComponent(leader.handle)}`;
  row.append(
    text('landing-leaderboard-category', category),
    text('landing-leaderboard-player', leader.displayName),
    text('landing-leaderboard-rating', `${leader.eloRating}${leader.provisional ? '?' : ''}`),
  );
  return row;
}

function statusRow(label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'site-box-row';
  row.append(text('site-box-row-label', label));
  return row;
}

function text(className: string, value: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = value;
  return element;
}
