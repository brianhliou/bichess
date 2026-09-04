import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPatronPage, renderPatronShellForPrerender } from './patron-page.js';

// The card hydrates asynchronously off /api/patron/config and the cached user.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('patron card when checkout is not configured', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/patron/config')) {
          return new Response(JSON.stringify({ configured: false, tiers: [] }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 401 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // The page has to state what Patron support costs even while checkout is off:
  // it is the only public description of what this site sells.
  it('shows the four monthly amounts', async () => {
    const page = buildPatronPage('en');
    document.body.append(page);
    await settle();

    const amounts = [...page.querySelectorAll<HTMLElement>('.patron-amount-btn')].map(
      (el) => el.textContent,
    );
    expect(amounts).toEqual(['$5', '$10', '$20', '$50']);
  });

  it('offers no way to start a charge', async () => {
    const page = buildPatronPage('en');
    document.body.append(page);
    await settle();

    expect(page.querySelector('.patron-donate-btn')).toBeNull();
    expect(page.querySelectorAll('.patron-preview-label')).toHaveLength(1);
    expect(page.querySelector('.patron-note')?.textContent).toContain('not open yet');
  });

  // The billing rules live on /terms; the surface that takes the money has to
  // point at them, in whatever locale the reader is on.
  it('links out to the billing terms', async () => {
    const page = buildPatronPage('en');
    document.body.append(page);
    await settle();

    const link = page.querySelector<HTMLAnchorElement>('.patron-terms-line a');
    expect(link?.getAttribute('href')).toBe('/terms');
    expect(page.querySelector('.patron-terms-line')?.textContent).toContain('refunds');
  });

  // localizedHref only prefixes /rules and /blog, so the href stays bare; the
  // label still has to be readable to a zh reader.
  it('links out to the billing terms in the reader locale', async () => {
    const page = buildPatronPage('zh-Hant');
    document.body.append(page);
    await settle();

    const link = page.querySelector<HTMLAnchorElement>('.patron-terms-line a');
    expect(link?.getAttribute('href')).toBe('/terms');
    expect(link?.textContent).toBe('使用條款');
  });
});

// The baked /patron frame. `dist/patron.html` is served as-is by
// servePrerenderedPage, so whatever this returns IS the page a crawler, a
// no-JS reader, or a payment processor fetching the URL gets. It shipped as an
// empty shell until 2026-09-04, which meant the route that names the product
// and its price described neither outside of a meta tag.
describe('prerendered patron shell', () => {
  it('states the price without running the app', () => {
    const html = renderPatronShellForPrerender('en');

    for (const amount of ['$5', '$10', '$20', '$50']) {
      expect(html).toContain(amount);
    }
  });

  it('states what a subscription is and is not', () => {
    const html = renderPatronShellForPrerender('en');

    // What is sold, and the two claims a reviewer of a "restricted business"
    // asks about: it buys a cosmetic badge, and it is not a charitable gift.
    expect(html).toContain('optional monthly subscription');
    expect(html).toContain('heart badge');
    expect(html).toContain('not tax-deductible');
    // Cancellation and refunds, plus the pointer to the full billing terms.
    expect(html).toContain('/terms');
  });

  // The status note is the one line in the preview card that tracks live
  // config. A build artifact cannot follow STRIPE_PRICE_* being set on Railway,
  // so baking it would leave the page claiming checkout is off after it is on.
  it('omits the checkout-status note, which only the live card can know', () => {
    expect(renderPatronShellForPrerender('en')).not.toContain('not open yet');
  });

  it('bakes real content rather than the loading placeholder', () => {
    const html = renderPatronShellForPrerender('en');

    expect(html).toContain('patron-form-preview');
    expect(html).not.toContain('<p>\u2026</p>');
  });
});
