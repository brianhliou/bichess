// /verify-title: request verification of a xiangqi or chess title (the
// lichess.org/verify-title equivalent). Signed-in players pick a title from
// the closed vocabulary, attach free-text evidence (federation profile links,
// real name, ratings), and submit. An admin reviews at /titles; approval stamps
// the title badge on the profile and user card. Signed-out visitors get a
// sign-in prompt. One pending request at a time; rejection allows resubmit.

import './verify-title.css';
import { type I18nKey, t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import {
  isPlayerTitle,
  type PlayerTitle,
  REQUESTABLE_PLAYER_TITLES,
  titleAbbr,
  titleFullName,
} from './player-titles.js';
import { buildNav, buildNotice } from './site-shell.js';
import { buildStaticPageLayout } from './static-page-shell.js';

// Mirrors TITLE_EVIDENCE_MAX in apps/server/src/routes/titles.ts.
const EVIDENCE_MAX = 4000;

// The two title families, in the order the vocabulary declares them. A title
// missing from REQUESTABLE_PLAYER_TITLES is skipped, and an empty group is not
// rendered, so re-narrowing the requestable list needs no change here.
const TITLE_GROUPS: readonly { labelKey: I18nKey; titles: readonly PlayerTitle[] }[] = [
  { labelKey: 'setup.xiangqi', titles: ['xgm', 'xim', 'xnm', 'xwgm', 'xwim'] },
  { labelKey: 'setup.chess', titles: ['gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm'] },
];

type MyRequestPayload = {
  title: PlayerTitle | null;
  request: {
    id: string;
    title: string;
    evidence: string;
    status: 'pending' | 'approved' | 'rejected';
    decidedAt: string | null;
    createdAt: string;
  } | null;
};

export async function mountVerifyTitle(root: HTMLElement): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'verify-title-route');

  // Rendered inside the shared /about rail + panel (lichess's title page lives
  // in the same site menu). The shell is still mutated async below; wrapping the
  // element reference keeps those updates intact.
  const shell = document.createElement('main');
  shell.className = 'site-section verify-title-shell';
  root.append(buildNav(locale), buildStaticPageLayout('title', shell, locale));

  let payload: MyRequestPayload;
  try {
    const resp = await fetch('/api/titles/my-request');
    if (resp.status === 401) {
      // The signed-out visitor is the least convinced person who reaches this
      // page, so the case for verifying belongs here most of all.
      shell.append(
        buildNotice(
          t('verifyTitle.signInTitle', {}, locale),
          t('verifyTitle.signInBody', {}, locale),
        ),
        buildPitchLink(locale),
      );
      return;
    }
    if (!resp.ok) throw new Error(`my-request failed: ${resp.status}`);
    payload = (await resp.json()) as MyRequestPayload;
  } catch {
    shell.append(
      buildNotice(t('verifyTitle.heading', {}, locale), t('verifyTitle.loadFailed', {}, locale)),
    );
    return;
  }

  renderPage(shell, payload, locale);
}

function renderPage(shell: HTMLElement, payload: MyRequestPayload, locale: Locale): void {
  shell.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('verifyTitle.heading', {}, locale);
  shell.append(heading);

  if (isPlayerTitle(payload.title)) {
    const held = document.createElement('p');
    held.className = 'verify-title-current';
    held.textContent = t(
      'verifyTitle.currentTitle',
      { title: titleLabel(payload.title, locale) },
      locale,
    );
    shell.append(held);
    // A held title unlocks the coach directory: offer the next step right
    // where the approval lands (covers the just-approved view and revisits).
    const coachCta = document.createElement('p');
    coachCta.className = 'verify-title-coach-cta';
    const coachLink = document.createElement('a');
    coachLink.className = 'landing-setup-back';
    coachLink.href = '/coach/edit';
    coachLink.textContent = t('verifyTitle.coachCta', {}, locale);
    coachCta.append(coachLink);
    shell.append(coachCta);
  }

  const request = payload.request;
  if (request && isPlayerTitle(request.title)) {
    shell.append(buildStatusCard(request.status, request.title, locale));
  }

  // The form shows unless a request is pending: fresh visitors submit, rejected
  // players resubmit, and titled/approved players may claim a different title
  // (e.g. a promotion). Server rules stay authoritative either way.
  if (request?.status === 'pending') return;

  const intro = document.createElement('p');
  intro.className = 'verify-title-intro';
  intro.textContent = t('verifyTitle.intro', {}, locale);
  // The form answers "how"; this answers "why".
  shell.append(
    intro,
    buildPitchLink(locale),
    buildForm(shell, payload, locale, request?.status === 'rejected'),
  );
}

function buildPitchLink(locale: Locale): HTMLElement {
  const pitch = document.createElement('p');
  pitch.className = 'verify-title-pitch';
  const link = document.createElement('a');
  link.href = '/blog/titled-players';
  link.textContent = t('verifyTitle.whatYouGet', {}, locale);
  pitch.append(link);
  return pitch;
}

function buildStatusCard(
  status: 'pending' | 'approved' | 'rejected',
  title: PlayerTitle,
  locale: Locale,
): HTMLElement {
  const card = document.createElement('section');
  card.className = `verify-title-status verify-title-status-${status}`;

  const label = titleLabel(title, locale);
  const headKey =
    status === 'pending'
      ? 'verifyTitle.statusPending'
      : status === 'approved'
        ? 'verifyTitle.statusApproved'
        : 'verifyTitle.statusRejected';
  const bodyKey =
    status === 'pending'
      ? 'verifyTitle.statusPendingBody'
      : status === 'approved'
        ? 'verifyTitle.statusApprovedBody'
        : 'verifyTitle.statusRejectedBody';

  const head = document.createElement('p');
  head.className = 'verify-title-status-head';
  head.textContent = t(headKey, { title: label }, locale);

  const body = document.createElement('p');
  body.className = 'verify-title-status-body';
  body.textContent = t(bodyKey, {}, locale);

  card.append(head, body);
  return card;
}

function buildForm(
  shell: HTMLElement,
  payload: MyRequestPayload,
  locale: Locale,
  isResubmit: boolean,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'verify-title-form';
  form.noValidate = true;

  const titleField = document.createElement('label');
  titleField.className = 'verify-title-field';
  const titleLabelText = document.createElement('span');
  titleLabelText.textContent = t('verifyTitle.titleLabel', {}, locale);
  const select = document.createElement('select');
  select.name = 'title';
  select.required = true;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('verifyTitle.titleChoose', {}, locale);
  select.append(placeholder);
  // Grouped by family so a bare GM never reads as a xiangqi title. Xiangqi
  // leads; the group labels reuse the existing setup.* variant names.
  for (const group of TITLE_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = t(group.labelKey, {}, locale);
    for (const title of group.titles) {
      if (!REQUESTABLE_PLAYER_TITLES.includes(title)) continue;
      const option = document.createElement('option');
      option.value = title;
      option.textContent = titleLabel(title, locale);
      optgroup.append(option);
    }
    if (optgroup.childElementCount > 0) select.append(optgroup);
  }
  titleField.append(titleLabelText, select);

  const evidenceField = document.createElement('label');
  evidenceField.className = 'verify-title-field';
  const evidenceLabelText = document.createElement('span');
  evidenceLabelText.textContent = t('verifyTitle.evidenceLabel', {}, locale);
  const evidence = document.createElement('textarea');
  evidence.name = 'evidence';
  evidence.required = true;
  evidence.rows = 6;
  evidence.maxLength = EVIDENCE_MAX;
  evidence.placeholder = t('verifyTitle.evidencePlaceholder', {}, locale);
  const evidenceHelp = document.createElement('p');
  evidenceHelp.className = 'verify-title-help';
  evidenceHelp.textContent = t('verifyTitle.evidenceHelp', {}, locale);
  evidenceField.append(evidenceLabelText, evidence, evidenceHelp);

  const status = document.createElement('p');
  status.className = 'verify-title-form-status';
  status.setAttribute('aria-live', 'polite');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'landing-setup-start';
  submit.textContent = t(isResubmit ? 'verifyTitle.resubmit' : 'verifyTitle.submit', {}, locale);

  form.append(titleField, evidenceField, submit, status);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isPlayerTitle(select.value)) {
      status.textContent = t('verifyTitle.errInvalidTitle', {}, locale);
      return;
    }
    if (evidence.value.trim().length === 0) {
      status.textContent = t('verifyTitle.errEvidenceRequired', {}, locale);
      return;
    }
    submit.disabled = true;
    status.textContent = t('verifyTitle.submitting', {}, locale);
    try {
      const resp = await fetch('/api/titles/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: select.value, evidence: evidence.value.trim() }),
      });
      const data = (await resp.json()) as {
        request?: MyRequestPayload['request'];
        error?: string;
      };
      if (!resp.ok || !data.request) {
        status.textContent = submitErrorMessage(data.error, locale);
        submit.disabled = false;
        return;
      }
      renderPage(shell, { title: payload.title, request: data.request }, locale);
    } catch {
      status.textContent = t('verifyTitle.submitFailed', {}, locale);
      submit.disabled = false;
    }
  });

  return form;
}

function submitErrorMessage(error: string | undefined, locale: Locale): string {
  switch (error) {
    case 'invalid_title':
      return t('verifyTitle.errInvalidTitle', {}, locale);
    case 'evidence_required':
      return t('verifyTitle.errEvidenceRequired', {}, locale);
    case 'evidence_too_long':
      return t('verifyTitle.errEvidenceTooLong', { max: EVIDENCE_MAX }, locale);
    case 'already_titled':
      return t('verifyTitle.errAlreadyTitled', {}, locale);
    case 'request_pending':
      return t('verifyTitle.errRequestPending', {}, locale);
    case 'not_signed_in':
      return t('verifyTitle.signInBody', {}, locale);
    default:
      return t('verifyTitle.submitFailed', {}, locale);
  }
}

// "XGM (Xiangqi Grandmaster)": abbreviation first so the select scans fast,
// full localized name for meaning.
function titleLabel(title: PlayerTitle, locale: Locale): string {
  return `${titleAbbr(title)} (${titleFullName(title, locale)})`;
}
