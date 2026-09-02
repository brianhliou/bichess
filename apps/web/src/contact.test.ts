import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContact } from './contact.js';

describe('contact page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('localizes the Traditional Chinese anonymous form chrome and validation', () => {
    const view = buildContact(null, false, 'zh-Hant');
    document.body.append(view.el);

    expect(view.el.querySelector('.site-section-heading')?.textContent).toBe('聯絡');
    expect(view.el.querySelector('.contact-intro')?.textContent).toBe(
      '這是直接聯絡 Mistboard 營運者的私人管道。Bug、壞掉的對局、帳號或付費問題，以及任何不想公開發布的內容。想收到回覆的話，可以留下信箱。',
    );
    const forumLink = view.el.querySelector<HTMLAnchorElement>('.contact-forum-note a');
    expect(forumLink?.getAttribute('href')).toBe('/forum');
    expect(forumLink?.textContent).toBe('論壇');
    expect(view.el.querySelector('.contact-forum-note')?.textContent).toBe(
      '提問、想法，以及其他玩家也能參與討論的話題，請發到論壇。',
    );
    expect(view.el.querySelector('textarea')?.placeholder).toBe('你想說什麼？');
    expect(view.el.querySelector('label.contact-field span')?.textContent).toBe('訊息');
    expect(view.el.querySelector('input[name="email"]')?.previousElementSibling?.textContent).toBe(
      '信箱（選填）',
    );
    expect(view.el.querySelector<HTMLAnchorElement>('.contact-signin-prompt a')?.textContent).toBe(
      '登入',
    );
    expect(view.el.querySelector('.contact-submit')?.textContent).toBe('送出');

    submitContactForm();

    expect(view.el.querySelector('.contact-status')?.textContent).toBe('請輸入訊息。');
  });

  it('localizes successful submit status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: true })),
    );
    const view = buildContact(null, false, 'zh-Hant');
    document.body.append(view.el);

    const message = view.el.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
    if (!message) throw new Error('missing message field');
    message.value = 'hello';

    submitContactForm();
    await flushDom();

    expect(view.el.querySelector('.contact-status')?.textContent).toBe('謝謝，訊息已收到。');
  });
});

function submitContactForm(): void {
  const form = document.querySelector<HTMLFormElement>('form.contact-form');
  if (!form) throw new Error('missing contact form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

async function flushDom(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
