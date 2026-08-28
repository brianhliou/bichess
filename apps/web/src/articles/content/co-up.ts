// The site's first page written in a language the interface does not speak.
//
// Vietnamese content is explicitly ungated (see the settled language policy:
// interface locales are closed at en/zh-Hans/zh-Hant forever, content in a
// language never was). `sourceLang: 'vi'` is what makes the page declare
// itself Vietnamese to search engines; without it, it would ship as
// <html lang="en"> and rank for nothing in its own language.
//
// It leads with "cờ úp" rather than "jieqi" on purpose. They are the same
// game, and cờ úp is the name a Vietnamese player types. The page is short by
// design: Vietnamese cờ úp players already know the rules, so this is a place
// to play, not an explainer, and short factual copy is also the least risky
// thing to publish in a language nobody here can proofread.

import type { Article } from '../types.js';

export const coUpArticle: Article = {
  slug: 'co-up',
  kind: 'article',
  publisher: 'mistboard',
  sourceLang: 'vi',
  title: 'Chơi cờ úp online',
  seoTitle: 'Cờ úp online: chơi miễn phí và phân tích bằng engine',
  summary:
    'Cờ úp trên Mistboard: chơi với engine hoặc với bạn bè, miễn phí và không cần tài khoản, rồi xem lại ván đấu với phân tích của engine.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-08-28',
  audience:
    'Người chơi cờ úp muốn một nơi hiện đại để chơi và để xem lại ván đấu của mình.',
  intro: [
    {
      kind: 'paragraph',
      text:
        'Cờ úp là cờ tướng với các quân được úp xuống và xáo trộn. Mỗi quân đi theo vị trí xuất phát mà nó đang đứng, rồi lật lên và từ đó mang đúng thân phận của mình. Bên ngoài Việt Nam, cờ này còn được gọi là jieqi (揭棋).',
    },
    {
      kind: 'paragraph',
      text:
        'Mistboard có cờ úp đầy đủ: chơi với engine hoặc mời bạn bè, miễn phí và không cần tài khoản.',
    },
  ],
  sections: [
    {
      heading: 'Phân tích bằng engine',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Sau mỗi ván, bạn xem lại được từng nước đi kèm đánh giá của engine. Engine chạy trên máy chủ, và chạy được cả trong trình duyệt của bạn.',
        },
        {
          kind: 'paragraph',
          text:
            'Một nửa số nước trong cờ úp là lật quân, tức là may rủi. Phần phân tích tách riêng hai thứ: quyết định bạn đưa ra, và quân bạn lật được. Chỉ phần đầu mới thuộc về bạn.',
        },
      ],
    },
    {
      heading: 'Bắt đầu chơi',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Mistboard là mã nguồn mở, và cờ úp ở đây miễn phí.',
        },
        {
          kind: 'cta',
          buttons: [
            {
              label: 'Chơi với máy',
              href: '/?play=computer&gameSpecId=jieqi',
              emphasis: 'primary',
            },
            {
              label: 'Mời bạn bè',
              href: '/?play=friend&gameSpecId=jieqi',
              emphasis: 'secondary',
            },
          ],
        },
      ],
    },
  ],
};
