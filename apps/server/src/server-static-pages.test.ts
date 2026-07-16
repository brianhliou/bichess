import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  injectPageMeta,
  serveArticlePage,
  serveArticlesIndexPage,
  serveNotFoundShell,
  serveRulesIndexPage,
  serveSitemap,
} from './server-static-pages.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {},
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as ServerResponse & ResponseCapture;
}

function indexHtml(): string {
  return [
    '<html>',
    '<head>',
    '<title>Mistboard</title>',
    '<meta name="description" content="old">',
    '<meta property="og:title" content="old">',
    '<meta property="og:description" content="old">',
    '<meta property="og:url" content="old">',
    '<meta property="og:image" content="old">',
    '<meta name="twitter:title" content="old">',
    '<meta name="twitter:description" content="old">',
    '<meta name="twitter:image" content="old">',
    '</head>',
    '<body><div id="app"></div></body>',
    '</html>',
  ].join('');
}

test('injectPageMeta replaces share tags and escapes injected values', () => {
  const html = injectPageMeta(indexHtml(), {
    title: 'A "quoted" <title>',
    description: 'Dark & hidden <info>',
    url: 'https://example.test/game/abc',
    imageUrl: 'https://example.test/og.png?x=1&y=2',
  });

  assert.match(html, /<title>A &quot;quoted&quot; &lt;title&gt;<\/title>/);
  assert.match(html, /<meta name="description" content="Dark &amp; hidden &lt;info&gt;">/);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/example.test\/og.png\?x=1&amp;y=2">/,
  );
});

test('serveNotFoundShell serves the SPA shell with a 404 status and noindex', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveNotFoundShell({ response, staticDir });

  assert.equal(response.status, 404);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(response.body, /<title>Page not found · Mistboard<\/title>/);
  assert.match(response.body, /<meta name="robots" content="noindex, follow">/);
  // The SPA mount point survives so the client can render the branded 404.
  assert.match(response.body, /<div id="app"><\/div>/);
});

test('serveArticlePage returns prerendered rules files from the rules base', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await mkdir(join(staticDir, 'rules'), { recursive: true });
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  await writeFile(join(staticDir, 'rules', 'fog-chess.html'), '<h1>prerendered</h1>');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'fog-chess',
    base: 'rules',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.body, '<h1>prerendered</h1>');
});

test('serveArticlePage falls back to index shell with rules metadata', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'fog-chess',
    base: 'rules',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 200);
  assert.match(response.body, /<title>Fog Chess Rules \| Mistboard<\/title>/);
  assert.match(
    response.body,
    /<meta property="og:url" content="https:\/\/mistboard.test\/rules\/fog-chess">/,
  );
  assert.match(
    response.body,
    /<meta property="og:image" content="https:\/\/mistboard.test\/og\/article\/fog-chess.png">/,
  );
});

test('serveArticlePage redirects an unpublished localized article to its English prerender', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await mkdir(join(staticDir, 'blog'), { recursive: true });
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  await writeFile(join(staticDir, 'blog', 'misty.html'), '<h1>English article</h1>');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'misty',
    base: 'blog',
    langPrefix: 'zh-hans',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/blog/misty');
  assert.equal(response.body, '');
});

test('serveArticlePage marks parked Shogi rules as non-indexable', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'dark-shogi',
    base: 'rules',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 200);
  assert.match(response.body, /<meta name="robots" content="noindex, follow">/);
});

test('serveSitemap omits parked Shogi rules while retaining public articles', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await mkdir(join(staticDir, 'rules'), { recursive: true });
  await mkdir(join(staticDir, 'blog'), { recursive: true });
  for (const slug of ['xiangqi', 'shogi', 'shogi4', 'dark-shogi']) {
    await writeFile(join(staticDir, 'rules', `${slug}.html`), '<h1>rules</h1>');
  }
  await writeFile(join(staticDir, 'blog', 'misty.html'), '<h1>article</h1>');
  const response = captureResponse();

  await serveSitemap({
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 200);
  assert.match(response.body, /https:\/\/mistboard\.test\/rules\/xiangqi/);
  assert.match(response.body, /https:\/\/mistboard\.test\/blog\/misty/);
  assert.doesNotMatch(response.body, /shogi/);
});

test('serveArticlePage 301s legacy /articles/<rules-slug> to /rules/<clean>', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'dark-chess-rules',
    base: 'articles',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.location, '/rules/fog-chess');
});

test('serveArticlePage 301s stable game ids to reader-facing rules slugs', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');

  for (const [slug, canonical] of [
    ['banqi', 'flip-xiangqi'],
    ['dark-chess', 'fog-chess'],
    ['dark-xiangqi', 'fog-xiangqi'],
    ['jieqi', 'reveal-xiangqi'],
  ] as const) {
    const response = captureResponse();
    await serveArticlePage({
      slug,
      base: 'rules',
      response,
      publicHost: 'https://mistboard.test',
      staticDir,
    });
    assert.equal(response.status, 301);
    assert.equal(response.headers.location, `/rules/${canonical}`);
  }
});

test('serveArticlePage 301s a rules slug requested under /articles to /rules, preserving lang', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'fog-chess',
    base: 'articles',
    langPrefix: 'zh-hans',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.location, '/zh-hans/rules/fog-chess');
});

test('serveArticlePage 301s legacy /articles/<article-slug> to /blog/<slug>', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'misty',
    base: 'articles',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.location, '/blog/misty');
});

test('serveArticlesIndexPage injects localized metadata', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(
    join(staticDir, 'index.html'),
    indexHtml().replace('<html>', '<html lang="en">'),
    'utf-8',
  );
  const response = captureResponse();

  await serveArticlesIndexPage({
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
    langPrefix: 'zh-hans',
  });

  assert.equal(response.status, 200);
  assert.match(response.body, /<html lang="zh-Hans">/);
  assert.match(response.body, /<title>文章 \| Mistboard<\/title>/);
  assert.match(
    response.body,
    /<meta property="og:url" content="https:\/\/mistboard.test\/zh-hans\/blog">/,
  );
});

test('serveArticlesIndexPage keeps the community-posts view canonical', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveArticlesIndexPage({
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
    view: 'community',
  });

  assert.equal(response.status, 200);
  assert.match(
    response.body,
    /<meta property="og:url" content="https:\/\/mistboard\.test\/blog\/community">/,
  );
});

test('serveRulesIndexPage injects rules metadata', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(
    join(staticDir, 'index.html'),
    indexHtml().replace('<html>', '<html lang="en">'),
    'utf-8',
  );
  const response = captureResponse();

  await serveRulesIndexPage({
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
    langPrefix: 'zh-hant',
  });

  assert.equal(response.status, 200);
  assert.match(response.body, /<html lang="zh-Hant">/);
  assert.match(response.body, /<title>規則 \| Mistboard<\/title>/);
  assert.match(
    response.body,
    /<meta property="og:url" content="https:\/\/mistboard.test\/zh-hant\/rules">/,
  );
});
