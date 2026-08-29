// Vietnamese landing page for cờ úp: the translation of jieqi-platform.
//
// A TRANSLATION, not a separate piece. jieqi-platform is the source and it is now
// published, so this tracks it: same order, same sections, same claims. When that
// page changes this one has to change with it, or the two drift and only readers
// of one language ever see the current argument.
//
// Vietnamese is a CONTENT language, not an interface locale (settled policy keeps
// the interface at en/zh-Hans/zh-Hant). So this is a standalone article with
// sourceLang: 'vi' rather than a /vi/ URL variant, and its hreflang pairing with
// jieqi-platform is declared explicitly in prerender-articles.mjs. That pairing
// only emits once BOTH are published, so it stays dark while this is a draft.
//
// Two deliberate departures from a literal translation, both because the audience
// differs rather than the argument:
//   - the rules link points at luat-co-up, the Vietnamese rules page, not the
//     English /rules/jieqi a Vietnamese reader would bounce off;
//   - the opening names 揭棋 rather than glossing "cờ úp", since a Vietnamese
//     reader already has the word and it is the Chinese name that is new to them.
//
// KNOWN FRICTION, decide before publishing: the copy is Vietnamese and the product
// is not. Board, review panel and study UI are English, as are the figures. For a
// visual game that is survivable and still beats having no Vietnamese page, but a
// reader arriving in Vietnamese and landing on an English interface is a real drop
// in the funnel and should not surprise anyone later.
//
// CAVEAT: this copy has NOT had a native read, and neither has luat-co-up. That is
// a reviewer rather than a task, and it is the actual blocker on publishing.

import { JIEQI_PLATFORM_GAME } from '../../jieqi-platform-game.js';
import type { Article, ArticleBlock } from '../types.js';

export const coUpArticle: Article = {
  slug: 'co-up',
  kind: 'article',
  publisher: 'mistboard',
  boardFamily: 'xiangqi',
  sourceLang: 'vi',
  title: 'Cờ úp trên Mistboard',
  seoTitle: 'Chơi cờ úp online, có phân tích bằng engine',
  summary:
    'Chơi cờ úp với máy hoặc với bạn bè, miễn phí và không cần tài khoản, rồi xem lại ván đấu với phân tích tách riêng phần bạn chọn khỏi phần bạn lật trúng.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-08-28',
  audience: 'Người chơi cờ úp đang tìm chỗ để chơi và để xem lại ván đấu của mình.',
  intro: [
    {
      kind: 'paragraph',
      text:
        'Cờ úp là [cờ tướng](/rules/xiangqi) với mọi quân đều úp xuống. Một quân đi theo vị trí xuất phát nó đang đứng, rồi lật lên và giữ đúng thân phận đó đến hết ván. Bạn vào ván mà không biết quân nào là quân gì, kể cả quân của mình. [Trang luật](/blog/luat-co-up) nói chi tiết.',
    },
    {
      kind: 'paragraph',
      text:
        'Đây là môn cờ còn trẻ, khởi đi từ Hồng Kông và Quảng Đông, lan rộng trong vài chục năm gần đây chủ yếu trong cộng đồng người Hoa và người Việt. Tiếng Trung gọi là 揭棋.',
    },
    {
      kind: 'cta',
      buttons: [
        { label: 'Chơi với máy', href: '/?play=computer&gameSpecId=jieqi', emphasis: 'primary' },
        { label: 'Mời bạn bè', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
      ],
    },
    {
      kind: 'jieqi-replay',
      spec: {
        red: JIEQI_PLATFORM_GAME.red,
        black: JIEQI_PLATFORM_GAME.black,
        event: JIEQI_PLATFORM_GAME.event,
        outcome: JIEQI_PLATFORM_GAME.outcome,
        resultText: JIEQI_PLATFORM_GAME.result,
        deal: JIEQI_PLATFORM_GAME.deal,
        moves: JIEQI_PLATFORM_GAME.moves,
        perspective: 'black',
      },
      caption:
        'Những đĩa trơn là quân còn úp. Mỗi quân lật lên ngay lần đầu nó di chuyển, và từ đó mang đúng thân phận vừa lộ.',
    } as ArticleBlock,
    {
      kind: 'paragraph',
      text:
        'Đó là [một ván thật trên trang này](/jieqi/game/jq_96f40ebb-1347-4c31-babe-d777c4a88ddf), không phải ván dựng, và mọi ảnh bên dưới đều lấy từ ván đó.',
    },
    {
      kind: 'paragraph',
      text:
        'Chơi với máy ở 1+1, 3+2 hoặc 5+5, hoặc gửi bạn bè một đường dẫn. Miễn phí, không cần đăng ký, không phải cài gì.',
    },
  ],
  sections: [
    {
      heading: 'Xem lại ván đấu',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Bấm phân tích một ván đã kết thúc, phần xem lại sẽ tách riêng cái bạn chọn với cái bạn lật trúng, đây là phần mà một trang cờ vua không có lý do gì phải làm. Bạn cũng nhận được những thứ quen thuộc: biểu đồ cả ván, chỉ số chính xác của từng bên, và mỗi nước thiếu chính xác, sai lầm hay sai lầm nghiêm trọng đều kèm nước đi tốt hơn. Phân tích chạy trên máy chủ của chúng tôi và mất vài phút.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-accuracy-summary.png',
          alt: 'Bảng tổng kết ván đấu: biểu đồ ưu thế đảo qua đảo lại suốt ván, bên cạnh là thẻ chỉ số chính xác ghi Pikafish 86 phần trăm với mười ba nước thiếu chính xác, hai sai lầm và một sai lầm nghiêm trọng, và Guest 91 phần trăm với sáu nước thiếu chính xác, hai sai lầm và một sai lầm nghiêm trọng.',
          caption: 'Vẫn ván ở trên, đã chấm điểm.',
        } as ArticleBlock,
        { kind: 'sub-heading', text: 'Nó cho bạn biết mỗi lần lật may tới đâu' },
        {
          kind: 'paragraph',
          text:
            'Một nửa số nước của bạn là lật quân, mà lật thì bạn không biết mình đang lật ra cái gì. Nên engine tính xem từng quân mà ô đó có thể là sẽ đáng giá bao nhiêu, rồi so với cái bạn thật sự lật được. Khoảng cách đó chính là phần may rủi của nước lật ấy.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-reveal-candidates.png',
          className: 'article-figure--tall',
          alt: 'Danh sách nước đi trong phần xem lại ván cờ úp. Nước 19 là nước lật quân mang huy hiệu xúc xắc ghi âm 21 phần trăm, phía dưới là bốn nước ứng viên xếp hạng ở mức 52, 39, 34 và 29 phần trăm với nước đã đi được đánh dấu ở vị trí thứ hai. Nước 21 ghi cộng 43 phần trăm, nước 21 của bên đen ghi cộng 6 phần trăm, và nước 22 ghi âm 10 phần trăm.',
          caption:
            'Nước 19 đi nước 39% trong khi có nước 52%, nên bị đánh dấu. Nước 21 đi đúng nước tốt nhất mà vẫn được lật cho +43%.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Tỉ lệ phần trăm bên cạnh mỗi nước là giá trị của nước đó trước khi bạn lật, lấy trung bình trên mọi quân mà ô đó có thể là. Con xúc xắc là phần mà cú lật thật sự cho bạn thêm vào đó. Vì vậy một nước có thể vừa là lựa chọn tốt nhất vừa kèm một dấu cộng hay dấu trừ rất lớn: số thứ nhất là quyết định của bạn, số thứ hai là phần bốc thăm.',
        },
        {
          kind: 'paragraph',
          text:
            'Khi nước bạn đi đứng đầu danh sách, tức là bạn đã chọn đúng. Nước chỉ bị đánh dấu là sai lầm khi trong danh sách có nước tốt hơn.',
        },
        {
          kind: 'paragraph',
          text:
            'Chỉ số chính xác sau đó chỉ được dựng từ các lựa chọn, nên lật trúng quân tốt không làm nó đẹp lên và lật phải quân xấu cũng không làm nó xấu đi.',
        },
        { kind: 'sub-heading', text: 'Và nó chạy ngay trong trình duyệt' },
        {
          kind: 'paragraph',
          text:
            'Bàn phân tích chạy đúng engine đó ngay trên máy bạn, vẽ sẵn các nước hay nhất lên bàn cờ khi bạn thử một biến. Không phải xếp hàng chờ, không gửi gì đi đâu, và không cần tài khoản. [Engine là mã nguồn mở](https://github.com/brianhliou/pikafish-jieqi-wasm), nên nếu bạn thấy một con số ở đây có vẻ sai, bạn đọc được đúng đoạn mã đã tạo ra nó.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-local-engine.png',
          alt: 'Bàn phân tích với engine chạy tại máy: PikaJieQi ở độ sâu 18 và 335.000 nút mỗi giây, ba biến ứng viên kèm đánh giá, và mũi tên cho từng biến vẽ trên bàn cờ úp.',
          caption: 'Chạy trong một tab trình duyệt.',
        } as ArticleBlock,
        {
          kind: 'cta',
          buttons: [{ label: 'Mở bàn phân tích', href: '/analysis/jieqi', emphasis: 'primary' }],
        },
      ],
    },
    {
      heading: 'Về engine',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'PikaJieQi là bản fork của [Pikafish](https://github.com/official-pikafish/Pikafish), engine cờ tướng mã nguồn mở, trên nhánh dành cho cờ úp. Tìm kiếm alpha-beta cổ điển với hàm đánh giá viết tay, không có mạng nơ-ron. Điều làm nó thành engine cờ úp chứ không phải engine cờ tướng là nó coi mỗi quân úp như một nút may rủi, chấm điểm một nước bằng trung bình trên từng quân mà ô đó còn có thể là. Nó chỉ nhìn thấy bàn cờ đã úp, và có một bài kiểm thử làm hỏng bản dựng nếu một thân phận bị lộ ra trong dữ liệu gửi cho nó.',
        },
        {
          kind: 'paragraph',
          text:
            'Nó đánh được nhưng không phải bất bại, và ván ở đầu trang này là một ván nó thua. Bạn xem nó tự đánh với chính mình trong [các ván engine này](/study/wd6c7qvG). Gần như toàn bộ sức mạnh của Pikafish hiện đại nằm ở mạng nơ-ron của nó, mà cờ úp thì chưa có mạng nào tốt: chúng tôi đã huấn luyện một mạng và nó chưa bao giờ mạnh hơn hàm đánh giá viết tay, nên đây là bài toán còn mở chứ không phải việc chưa ai bắt tay vào. Nếu bạn huấn luyện được mạng nơ-ron, hoặc rành cờ úp đủ để chỉ ra engine đánh giá sai ở đâu, đó là đóng góp chúng tôi mong nhất.',
        },
      ],
    },
    {
      heading: 'Bạn nhận được gì',
      blocks: [
        {
          kind: 'table',
          headers: ['', 'Trên Mistboard'],
          rows: [
            ['Chơi với máy hoặc với bạn bè', 'Miễn phí, không cần tài khoản'],
            ['Phân tích cả ván', 'Mọi ván đã kết thúc'],
            ['Đo riêng phần may rủi', 'Mỗi lần lật đều được định giá'],
            ['Engine trong trình duyệt', 'Không chờ, không cần tài khoản'],
            ['Study giữ đúng lần xáo quân', 'Có'],
            ['Engine mã nguồn mở', 'Có'],
            ['Bảng xếp hạng tính điểm', 'Đã mở, cần đăng nhập'],
          ],
        },
      ],
    },
    {
      heading: 'Câu hỏi thường gặp',
      blocks: [
        {
          kind: 'faq',
          items: [
            {
              question: 'Cờ úp là gì?',
              answer:
                'Là cờ tướng với mọi quân trừ tướng đều úp xuống. Một quân đi theo vị trí xuất phát nó đang đứng, rồi lật lên và giữ đúng thân phận đó. Tiếng Trung gọi là 揭棋.',
            },
            {
              question: 'Cờ úp khác cờ tướng ở chỗ nào?',
              answer:
                'Cùng bàn cờ, cùng quân cờ, cùng nước đi, cùng mục tiêu. Chỉ khác là bạn không biết quân nào là quân gì, nên khoảng một nửa số nước của bạn là lật một quân lên để biết.',
            },
            {
              question: 'Cờ úp có phải chỉ ăn may không?',
              answer:
                'Lật quân là may rủi, nhưng bạn làm gì với nó thì không. Chỉ số chính xác của bạn chỉ dựng từ các lựa chọn, nên lật trúng quân tốt không làm nó đẹp lên và lật phải quân xấu cũng không làm nó xấu đi.',
            },
            {
              question: 'Máy chơi cờ úp có hay không?',
              answer:
                'Khá, chưa xuất sắc. Engine của chúng tôi vẫn bị người chơi mạnh đánh bại, chủ yếu vì chưa có mạng nơ-ron nào được huấn luyện cho cờ úp.',
            },
            {
              question: 'Engine có nhìn thấy quân úp của tôi không?',
              answer:
                'Không. Nó nhận đúng bàn cờ đã úp như bạn đang thấy và không bao giờ được cho biết lần xáo quân. Có một bài kiểm thử làm hỏng bản dựng nếu một thân phận lọt vào dữ liệu gửi cho nó.',
            },
            {
              question: 'Xáo quân có công bằng không?',
              answer:
                'Lần xáo là ngẫu nhiên, thực hiện trên máy chủ, và không nói cho ai: không cho bạn, không cho đối thủ, không cho engine.',
            },
            {
              question: 'Chơi cờ úp online miễn phí ở đâu?',
              answer:
                'Ngay tại đây, với máy hoặc với bạn bè. Không cần tài khoản, không phải cài gì, và xem lại ván đấu bằng phân tích engine sau khi chơi xong.',
            },
          ],
        },
      ],
    },
    {
      heading: 'Bắt đầu chơi',
      blocks: [
        {
          kind: 'cta',
          buttons: [
            { label: 'Chơi với máy', href: '/?play=computer&gameSpecId=jieqi', emphasis: 'primary' },
            { label: 'Mời bạn bè', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
            { label: 'Xem luật cờ úp', href: '/blog/luat-co-up', emphasis: 'secondary' },
          ],
        },
      ],
    },
  ],
};
