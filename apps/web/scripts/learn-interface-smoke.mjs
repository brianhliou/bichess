import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = new URL('..', import.meta.url);
const port = Number(process.env.MISTBOARD_LEARN_TEST_PORT ?? 3127);
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: fileURLToPath(webRoot),
  env: {
    ...process.env,
    BROWSER: 'none',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(`${baseUrl}/learn`);
  await smokeLearnInterface();
} finally {
  await stopServer();
}

async function smokeLearnInterface() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    await page.goto(`${baseUrl}/learn`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.learn-home-shell');

    await assertVisible(page, '.site-nav-brand img.site-nav-logo[src="/logo.svg"]');
    assert.equal(await page.locator('.site-nav-brand-name').textContent(), 'mistboard.com');

    assert.equal(await page.locator('.learn-home .learn-heading').textContent(), 'Learn to play');

    // The xiangqi course leads the hub; its CTA deep-links into /learn/xiangqi.
    const xiangqiCard = page.locator('.learn-course-card');
    assert.equal(await xiangqiCard.count(), 1, 'xiangqi course card should appear once');
    assert.equal(
      await xiangqiCard.locator('.learn-course-card-cta').textContent(),
      'Start learning',
    );

    // Dark chess modules sit below the course card, under their own heading.
    assert.equal(
      await page.locator('.learn-home-section-title').first().textContent(),
      'Dark chess modules',
    );
    assert.ok((await page.locator('.learn-module-card').count()) >= 24);

    const firstSection = page.locator('.learn-module-section').first();
    assert.equal(
      await firstSection.locator('.learn-module-section-header h2').textContent(),
      'Exploratory',
    );
    assert.equal(await firstSection.locator('.learn-module-card').count(), 21);
    assert.equal(
      await firstSection.locator('.learn-module-card h2').first().textContent(),
      'Always Take The King',
    );
    assert.equal(
      await firstSection.locator('.learn-module-card h2').nth(1).textContent(),
      'Dark Chess Basics',
    );
    await firstSection.getByRole('button', { name: 'Practice king captures' }).click();
    await page.waitForSelector('.learn-tutorial-shell');
    await page.waitForFunction(
      () => window.location.hash === '#/always-take-the-king/king-capture-rook-file',
    );
    assert.equal(await page.locator('.learn-heading').textContent(), 'Always Take The King');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Rook on the same file');
    assert.equal(await page.locator('.learn-menu-header h2').textContent(), 'Always Take The King');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);
    await dragSquare(page, 'h1', 'h8');
    await page.waitForSelector('.learn-tutorial-message.success');
    const kingCaptureText = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(kingCaptureText ?? '', /no better move than taking a visible king/);
    await page.locator('.learn-actions').getByRole('button', { name: 'Next' }).click();
    await page.waitForFunction(
      () =>
        window.location.hash === '#/always-take-the-king/king-capture-bishop-diagonal' &&
        document.querySelector('.learn-chapter-title')?.textContent === 'Bishop on the diagonal',
    );
    await page.locator('.learn-menu-back').click();
    await page.waitForSelector('.learn-home-shell');

    const wipSection = page.locator('.learn-module-section').filter({ hasText: 'WIP' });
    assert.equal(await wipSection.locator('.learn-module-card').count(), 3);
    assert.equal(
      await wipSection.locator('.learn-module-card h2').first().textContent(),
      'K+Q vs K',
    );
    assert.equal(
      await wipSection.locator('.learn-module-card h2').nth(1).textContent(),
      'K+R vs K',
    );
    await wipSection.getByRole('button', { name: 'Open queen endgame' }).click();
    await page.waitForSelector('.learn-tutorial-shell');
    await page.waitForFunction(
      () => window.location.hash === '#/queen-vs-king/kqk-free-queen-vision',
    );
    assert.equal(await page.locator('.learn-heading').textContent(), 'K+Q vs K');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Queen floodlight');
    assert.equal(await page.locator('.learn-menu-header h2').textContent(), 'K+Q vs K');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);
    await assertVisible(page, '.learn-board');
    await assertOnlyWhitePracticePieces(page);
    await dragSquare(page, 'd4', 'h4');
    await page.waitForFunction(() =>
      document.querySelector('.learn-tutorial-message')?.textContent?.includes('no Black move'),
    );
    await assertOnlyWhitePracticePieces(page);
    await dragSquare(page, 'h4', 'h8');
    await page.waitForFunction(() =>
      document.querySelector('.learn-tutorial-message')?.textContent?.includes('no Black move'),
    );
    await assertOnlyWhitePracticePieces(page);
    await page.locator('.learn-menu-back').click();
    await page.waitForSelector('.learn-home-shell');

    await page.goto(`${baseUrl}/learn#/rook-vs-king/krk-free-rook-vision`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.learn-tutorial-shell');
    assert.equal(await page.locator('.learn-heading').textContent(), 'K+R vs K');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Free rook vision');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 5);
    await assertOnlyWhitePracticePieces(page);
    await page.locator('.learn-menu-back').click();
    await page.waitForSelector('.learn-home-shell');

    const exploratorySection = page
      .locator('.learn-module-section')
      .filter({ hasText: 'Exploratory' });
    assert.equal(
      await page.locator('.learn-module-section-header h2', { hasText: 'Research track' }).count(),
      0,
    );
    assert.equal(
      await exploratorySection.locator('.learn-module-card h2').first().textContent(),
      'Always Take The King',
    );
    assert.equal(
      await exploratorySection.locator('.learn-module-card h2').nth(1).textContent(),
      'Dark Chess Basics',
    );

    await page.goto(`${baseUrl}/learn#/queen-vs-king/kqk-known-start-superposition`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.learn-tutorial-shell');
    assert.equal(await page.locator('.learn-heading').textContent(), 'K+Q vs K');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Known start net');
    const superpositionText = (await page.locator('.learn-tutorial-message').textContent()) ?? '';
    assert.match(superpositionText, /paper assumption/);
    assert.equal(await countLearnBoardPieces(page, 'black', 'king'), 1);
    await dragSquare(page, 'b1', 'b6');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.learn-board piece')].filter((node) => {
          const className = node.getAttribute('class') ?? '';
          return className.includes('black') && className.includes('king');
        }).length === 3,
    );
    assert.equal(await countLearnBoardPieces(page, 'black', 'king'), 3);
    const knownStartText = (await page.locator('.learn-tutorial-message').textContent()) ?? '';
    assert.match(knownStartText, /3 candidates still possible/);
    assert.equal(await page.locator('.learn-board square.learn-candidate').count(), 0);
    assert.equal(await page.locator('.learn-board square.learn-flushed').count(), 0);

    await page.goto(`${baseUrl}/learn#/queen-vs-king/kqk-superposition-corner`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.learn-tutorial-shell');
    assert.equal(await page.locator('.learn-heading').textContent(), 'K+Q vs K');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Unknown start net');
    const unknownStartText = (await page.locator('.learn-tutorial-message').textContent()) ?? '';
    assert.match(unknownStartText, /initial square is unknown/);
    assert.equal(await countLearnBoardPieces(page, 'black', 'king'), 42);
    assert.equal(await page.locator('.learn-board square.learn-candidate').count(), 0);
    assert.equal(await page.locator('.learn-board square.learn-flushed').count(), 0);
    await dragSquare(page, 'b1', 'b6');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.learn-board piece')].filter((node) => {
          const className = node.getAttribute('class') ?? '';
          return className.includes('black') && className.includes('king');
        }).length === 38,
    );
    assert.equal(await countLearnBoardPieces(page, 'black', 'king'), 38);
    assert.equal(await page.locator('.learn-board square.learn-candidate').count(), 0);
    assert.equal(await page.locator('.learn-board square.learn-flushed').count(), 0);
    const flushedText = (await page.locator('.learn-tutorial-message').textContent()) ?? '';
    assert.match(flushedText, /38 squares could still hold the king/);
    assert.match(flushedText, /23 connected squares were revealed/);
    await page.locator('.learn-menu-back').click();
    await page.waitForSelector('.learn-home-shell');

    await page.goto(`${baseUrl}/learn#/unknown-is-not-empty`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.learn-tutorial-shell');
    assert.equal(await page.locator('.learn-heading').textContent(), 'Unknown Is Not Empty');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Planned module');
    await assertVisible(page, '.learn-board');
    assert.equal(await page.locator('.learn-menu-header h2').textContent(), 'Unknown Is Not Empty');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);
    await page.locator('.learn-menu-back').click();
    await page.waitForSelector('.learn-home-shell');
    assert.ok((await page.locator('.learn-module-card').count()) >= 24);

    await page.goto(`${baseUrl}/learn`, { waitUntil: 'networkidle' });
    await page.locator('.learn-module-card').getByRole('button', { name: 'Start basics' }).click();
    await page.waitForSelector('.learn-tutorial-shell');
    await page.waitForFunction(() => window.location.hash === '#/basics/tutorial-vision');

    // Tutorial module: 3 shipped steps in the cleaner chapter rail.
    assert.equal(await page.locator('.learn-progress').textContent(), 'Chapter 1 of 3');
    assert.equal(await page.locator('.learn-heading').textContent(), 'Vision');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Move and watch');
    assert.equal(await page.locator('.learn-menu-header h2').textContent(), 'Dark Chess Basics');
    assert.equal(await page.locator('.learn-menu-chapter').count(), 3);

    // Step 1: any legal rook move counts.
    await dragSquare(page, 'd1', 'd4');
    await page.waitForSelector('.learn-tutorial-message.success');
    const step1Text = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(step1Text ?? '', /Vision moves with the piece/);
    // With Step 2 shipped, the next-step CTA is now "Next".
    const nextButton = page.locator('.learn-actions').getByRole('button', { name: 'Next' });
    assert.equal(await nextButton.count(), 1);

    // Advance to Step 2 via the Next button.
    await nextButton.click();
    await page.waitForFunction(
      () => document.querySelector('.learn-progress')?.textContent === 'Chapter 2 of 3',
    );
    assert.equal(await page.locator('.learn-heading').textContent(), 'King Capture');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'Take the king');

    // Step 2: drag rook h1→h8 to capture the exposed black king and win.
    await dragSquare(page, 'h1', 'h8');
    await page.waitForSelector('.learn-tutorial-message.success');
    const step2Text = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(step2Text ?? '', /You captured the king/);
    // With Step 3 shipped, Step 2's success CTA is "Next".
    const step2Next = page.locator('.learn-actions').getByRole('button', { name: 'Next' });
    assert.equal(await step2Next.count(), 1);

    // Advance to Step 3.
    await step2Next.click();
    await page.waitForFunction(
      () => document.querySelector('.learn-progress')?.textContent === 'Chapter 3 of 3',
    );
    assert.equal(await page.locator('.learn-heading').textContent(), 'Hidden Moves');
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'What just happened?');

    // Step 3 is a click-to-reveal chapter — no board moves accepted, just the
    // "Reveal what happened" button.
    const revealButton = page.locator('.learn-actions').getByRole('button', {
      name: 'Reveal what happened',
    });
    assert.equal(await revealButton.count(), 1);
    await revealButton.click();
    await page.waitForSelector('.learn-tutorial-message.success');
    const step3Text = await page.locator('.learn-tutorial-message.success').textContent();
    assert.match(step3Text ?? '', /knight from b8 to c6/);
    // Step 3 now chains into the Endgames module.
    const step3Next = page.locator('.learn-actions').getByRole('button', { name: 'Next module' });
    assert.equal(await step3Next.count(), 1);
    await step3Next.click();
    await page.waitForFunction(
      () => document.querySelector('.learn-heading')?.textContent === 'The Two Kings Standoff',
    );
    await page.waitForFunction(() => window.location.hash === '#/endgames/kvk-chase');
    assert.equal(
      await page.locator('.learn-menu-header h2').textContent(),
      'The Two Kings Standoff',
    );
    assert.equal(await page.locator('.learn-menu-chapter').count(), 6);
    assert.equal(await page.locator('.learn-chapter-title').textContent(), 'The chase');
    const playHint = (await page.locator('.learn-hint').textContent()) ?? '';
    assert.match(playHint, /Move your king/);

    await page.locator('.learn-menu-back').click();
    await page.waitForSelector('.learn-home-shell');
    assert.ok((await page.locator('.learn-module-card').count()) >= 24);
  } finally {
    await browser.close();
  }
}

async function assertVisible(page, selector) {
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `${selector} should appear once`);
  assert.equal(await locator.first().isVisible(), true, `${selector} should be visible`);
}

async function countLearnBoardPieces(page, color, role) {
  const pieces = await page
    .locator('.learn-board piece')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('class') ?? ''));
  return pieces.filter((className) => className.includes(color) && className.includes(role)).length;
}

async function assertOnlyWhitePracticePieces(page) {
  const pieces = await page
    .locator('.learn-board piece')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('class') ?? ''));
  assert.equal(
    pieces.filter((className) => className.includes('black') && !className.includes('ghost'))
      .length,
    0,
  );
  assert.equal(
    pieces.filter((className) => className.includes('white') && !className.includes('ghost'))
      .length,
    2,
  );
}

async function _clickLesson(page, title) {
  const label = page
    .locator('.learn-menu .learn-menu-lesson-label')
    .getByText(title, { exact: true });
  assert.equal(await label.count(), 1, `${title} lesson should appear once`);
  await label.click();
}

async function dragSquare(page, from, to) {
  const box = await page.locator('.learn-board').boundingBox();
  assert.ok(box, 'learn board should have a bounding box');
  const fromPoint = squareCenter(box, from);
  const toPoint = squareCenter(box, to);
  await page.mouse.move(fromPoint.x, fromPoint.y);
  await page.mouse.down();
  await page.mouse.move(toPoint.x, toPoint.y, { steps: 12 });
  await page.mouse.up();
}

function squareCenter(box, square) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  const cell = box.width / 8;
  return {
    x: box.x + (file + 0.5) * cell,
    y: box.y + (8 - rank + 0.5) * cell,
  };
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited early from ${scriptPath}\n${serverOutput}`);
    }
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for ${url}\n${serverOutput}`);
}

async function stopServer() {
  if (server.exitCode !== null) return;
  signalServer('SIGTERM');
  await waitForServerExit(2_000);
  if (server.exitCode !== null) return;
  signalServer('SIGKILL');
  await waitForServerExit(1_000);
}

function signalServer(signal) {
  if (!server.pid) return;
  try {
    if (process.platform === 'win32') {
      server.kill(signal);
      return;
    }
    process.kill(-server.pid, signal);
  } catch {
    try {
      server.kill(signal);
    } catch {
      // Already stopped.
    }
  }
}

async function waitForServerExit(timeoutMs) {
  if (server.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
