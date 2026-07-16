// Small DOM builders shared by the newer static content pages (contribute,
// thanks, lag). They emit the `.static-prose` markup styled in
// static-page-shell.css. The older pages in pages-static.ts keep their own local
// helpers; this module exists so the new pages don't each re-roll the same code.

export function proseSection(className: string): HTMLElement {
  const section = document.createElement('section');
  section.className = `site-section static-prose ${className}`;
  return section;
}

export function proseHeading(text: string): HTMLElement {
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = text;
  return heading;
}

export function proseSubheading(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}

export function proseParagraph(parts: Array<string | Node>): HTMLParagraphElement {
  const p = document.createElement('p');
  for (const part of parts) {
    p.append(typeof part === 'string' ? document.createTextNode(part) : part);
  }
  return p;
}

export function proseLink(label: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  return a;
}

export function proseExternalLink(label: string, href: string): HTMLAnchorElement {
  const a = proseLink(label, href);
  a.target = '_blank';
  a.rel = 'noreferrer noopener';
  return a;
}
