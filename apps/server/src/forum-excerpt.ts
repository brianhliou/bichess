// Plain-text excerpt of a forum post for list surfaces (the homepage forum
// box shows the latest post's opening words under each topic, lichess-style).
// Post bodies are plain text with ">" quote lines and bare URLs; the excerpt is
// the post's OWN words, so quoted lines are dropped unless the post is nothing
// but a quote. Whitespace collapses to one line; the cut lands on a word
// boundary when one is close enough.
export function forumExcerpt(bodyText: string, maxLength = 160): string {
  const lines = bodyText.split(/\r?\n/);
  const ownLines = lines.filter((line) => !line.startsWith('>'));
  const source =
    ownLines.join(' ').trim().length > 0
      ? ownLines
      : lines.map((line) => line.replace(/^>\s?/, ''));
  const text = source.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 3);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.trimEnd()}...`;
}
