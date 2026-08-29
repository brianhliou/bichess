// Vietnamese landing page for cờ úp: the translation of jieqi-platform.
//
// This is a TRANSLATION, not a separate piece. jieqi-platform is the source; when
// it changes, this changes. It was briefly written as its own short page and that
// was the wrong call: two pages arguing different things about the same product is
// how the English and Vietnamese sides drift apart.
//
// Vietnamese is a CONTENT language, not an interface locale (settled policy: the
// interface stays en/zh-Hans/zh-Hant). So this is a standalone article with
// sourceLang: 'vi' rather than a /vi/ URL variant, and its hreflang pairing with
// jieqi-platform is declared explicitly in prerender-articles.mjs.
//
// KNOWN FRICTION, worth deciding on before this ships: the copy is Vietnamese but
// the product it sends people to is not. The board, the review panel and the study
// UI are all English, and the figures below are English screenshots. For a visual
// game that is survivable, and it is still better than no Vietnamese page, but a
// reader arriving in Vietnamese and landing on an English interface is a real drop
// in the funnel and nobody should be surprised by it later.
//
// CAVEAT: this copy has NOT had a native read. See the same note on luat-co-up.

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
    'Chơi cờ úp với máy hoặc với bạn bè, miễn phí và không cần tài khoản, rồi xem lại ván đấu với phân tích engine tách riêng phần may rủi khỏi phần quyết định.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-08-28',
  audience:
    'Người chơi cờ úp muốn một nơi hiện đại để chơi và xem lại ván đấu, và người tò mò xem một ván cờ có yếu tố may rủi thì phân tích thế nào cho sòng phẳng.',
  intro: [
    {
      kind: 'paragraph',
      text:
        'Cờ úp là [cờ tướng](/rules/xiangqi) với mọi quân đều úp xuống. Một quân đi theo vị trí xuất phát mà nó đang đứng, rồi lật lên và giữ đúng thân phận đó đến hết ván. [Trang luật](/blog/luat-co-up) nói chi tiết.',
    },
    {
      kind: 'paragraph',
      text:
        'Đây là một môn cờ còn trẻ. Cờ úp (揭棋, jieqi) hình thành ở Hồng Kông và Quảng Đông rồi lan ra trong vài chục năm gần đây, chủ yếu trong cộng đồng người Hoa và người Việt. Bàn cờ, quân cờ và nước đi vẫn là của cờ tướng; cái mới là bạn bắt đầu ván cờ mà không biết quân nào là quân gì, kể cả quân của mình.',
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
        'Một ván thật trên Mistboard: một người chơi khách thắng engine sau 73 nước. Bấm để đi từng nước. Quân úp là các đĩa trơn, lật lên ngay lần đầu chúng di chuyển và giữ nguyên thân phận vừa lộ.',
    } as ArticleBlock,
    {
      kind: 'paragraph',
      text:
        'Mistboard hỗ trợ cờ úp đầy đủ. Chơi với máy ở 1+1, 3+2 hoặc 5+5, hoặc gửi bạn bè một đường dẫn, rồi xem lại ván đấu bằng engine xử lý phần lật quân một cách sòng phẳng. Miễn phí, không cần đăng ký, không phải cài gì.',
    },
  ],
  sections: [
    {
      heading: 'Phân tích',
      blocks: [
        { kind: 'sub-heading', text: 'Mỗi ván đã kết thúc được phân tích toàn bộ' },
        {
          kind: 'paragraph',
          text:
            'Bấm phân tích trên một ván đã xong là engine đánh giá mọi thế cờ trong ván đó. Bạn nhận được biểu đồ ưu thế suốt ván, chỉ số chính xác của từng bên, và mỗi nước thiếu chính xác, sai lầm hay sai lầm nghiêm trọng đều được đánh dấu kèm nước đi tốt hơn.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-accuracy-summary.png',
          alt: 'Bảng tổng kết ván đấu: biểu đồ ưu thế đảo qua đảo lại suốt ván, bên cạnh là thẻ chỉ số chính xác ghi Pikafish 86 phần trăm với mười ba nước thiếu chính xác, hai sai lầm và một sai lầm nghiêm trọng, và Guest 91 phần trăm với sáu nước thiếu chính xác, hai sai lầm và một sai lầm nghiêm trọng.',
          caption:
            'Vẫn ván đó, đã chấm điểm. Engine thua ván này, và biểu đồ cho thấy vì sao: nó dẫn gần hết trung cuộc rồi trả lại ở cuối ván.',
        } as ArticleBlock,
        { kind: 'sub-heading', text: 'Phần lật quân được tính riêng khỏi phần quyết định' },
        {
          kind: 'paragraph',
          text:
            'Khoảng một nửa số nước trong ván cờ úp là nước lật quân, mà một nước lật gồm hai phần: quyết định của bạn và phần rút thăm may rủi. Chấm chung hai phần đó là chấm điểm bạn theo vận may, nên Mistboard tách riêng: mỗi nước lật được đánh giá qua từng quân mà ô đó có thể là, có trọng số theo số quân loại đó bạn còn lại.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-reveal-candidates.png',
          alt: 'Danh sách nước đi trong phần xem lại ván cờ úp. Nước 19 là nước lật quân, mang huy hiệu xúc xắc ghi âm 21 phần trăm, phía dưới là bốn nước ứng viên xếp hạng ở mức 52, 39, 34 và 29 phần trăm với nước đã đi được đánh dấu ở vị trí thứ hai. Nước 21 ghi cộng 43 phần trăm, nước 21 của bên đen ghi cộng 6 phần trăm, và nước 22 ghi âm 10 phần trăm.',
          caption:
            'Nước lật quân có danh sách ứng viên xếp hạng và một cái giá cho phần may rủi, tốt hoặc xấu. Nước thường chỉ có một đánh giá bình thường.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Mỗi tỉ lệ phần trăm là tỉ lệ thắng của nước đó cho bên đang đi, lấy trung bình theo mọi quân mà ô đó có thể lật ra. Đó không phải xác suất nước đó là nước hay nhất, cũng không phải thứ hạng của engine. Danh sách gồm ba nước tốt nhất theo engine, cộng thêm nước bạn đã đi nếu nó chưa nằm trong đó, nên có nước lật hiện ba dòng và có nước hiện bốn dòng.',
        },
        {
          kind: 'paragraph',
          text:
            'Chỉ số chính xác chỉ được chấm trên phần quyết định, nên lật được quân tốt không làm nó đẹp lên và lật phải quân xấu cũng không làm nó xấu đi.',
        },
        { kind: 'sub-heading', text: 'Cùng engine đó chạy ngay trong trình duyệt' },
        {
          kind: 'paragraph',
          text:
            'Bàn phân tích chạy engine ngay trên máy bạn, biên dịch sang WebAssembly, vẽ sẵn vài nước ứng viên lên bàn cờ khi bạn đi theo một biến. Không phải xếp hàng chờ, không gửi gì đi đâu, và không cần tài khoản.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-local-engine.png',
          alt: 'Bàn phân tích với engine chạy tại máy: PikaJieQi ở độ sâu 18 và 335.000 nút mỗi giây, ba biến ứng viên kèm đánh giá, và mũi tên cho từng biến vẽ trên bàn cờ úp.',
          caption: 'Độ sâu 18 ở 335.000 nút mỗi giây, chạy trong một tab trình duyệt.',
        } as ArticleBlock,
        {
          kind: 'cta',
          buttons: [{ label: 'Mở bàn phân tích', href: '/analysis/jieqi', emphasis: 'primary' }],
        },
      ],
    },
    {
      heading: 'Nghiên cứu ván cờ',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Bạn tạo được một study từ một ván đấu hoặc từ một thế cờ tự bày, giữ nhiều chương trong đó, ghi chú lên từng nước và chia sẻ đường dẫn. Ván cờ úp bắt đầu từ một lần xáo quân chứ không từ thế cờ cố định, nên mỗi chương giữ riêng lần xáo của nó và mở lại đúng bàn cờ bạn đã lưu, không phải một lần xáo mới.',
        },
        {
          kind: 'paragraph',
          text:
            'Tài liệu cờ úp bằng tiếng Anh hay tiếng Việt đều rất ít, nên chúng tôi tự làm. [Jieqi engine reference games](/study/wd6c7qvG) là các ván PikaJieQi tự đánh với chính nó, ván nào cũng chơi đến kết cục thật. Đây là ván của máy, không phải ván của kỳ thủ mạnh: hãy đi thử từng nước, rẽ nhánh theo ý bạn, rồi cho engine trong trình duyệt chạy trên biến của bạn.',
        },
        {
          kind: 'cta',
          buttons: [{ label: 'Mở study', href: '/study/wd6c7qvG', emphasis: 'primary' }],
        },
      ],
    },
    {
      heading: 'Về engine',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'PikaJieQi là một bản fork của [Pikafish](https://github.com/official-pikafish/Pikafish), engine cờ tướng mã nguồn mở, trên nhánh dành cho cờ úp: tìm kiếm cổ điển, hàm đánh giá viết tay, không có mạng nơ-ron. [Bản fork và bản WebAssembly của chúng tôi](https://github.com/brianhliou/pikafish-jieqi-wasm) đều công khai, và cùng một mã nguồn tạo ra cả engine chơi với bạn lẫn engine phân tích trong trình duyệt. Bản chạy trên máy chủ được ghim vào đúng một commit, nên nó không tự đổi giữa ván này với ván khác.',
        },
        {
          kind: 'paragraph',
          text:
            'Engine chỉ nhìn thấy bàn cờ đã che, mọi quân úp được ghi là một chữ x vô danh. Nó không biết lần xáo quân, và có một bài kiểm thử làm hỏng bản dựng nếu định dạng truyền đi lỡ để lộ thân phận thật.',
        },
        { kind: 'sub-heading', text: 'Chỗ nó còn yếu' },
        {
          kind: 'paragraph',
          text:
            'Nó đánh giá quá lạc quan các quân úp của chính mình nên hay dấn quân. Chúng tôi đo được thiên lệch này giữ nguyên từ độ sâu 8 đến độ sâu 48, tức là nó nằm ở hàm đánh giá chứ không phải ở tìm kiếm, nên cho nghĩ lâu hơn cũng không hết. Ván ở đầu trang này là một ván engine thua đúng vì lý do đó.',
        },
        {
          kind: 'paragraph',
          text:
            'Cách chữa là một mạng NNUE. Gần như toàn bộ sức mạnh của Pikafish hiện đại nằm ở NNUE của nó, mà cờ úp thì chưa có mạng nào được huấn luyện; nhánh chúng tôi dùng có trước NNUE và đánh giá bằng tay. Chỗ nối đã sẵn sàng, chỉ cần trỏ engine vào một tệp mạng là nó nạp. Phần chưa giải được là tạo ra mạng đó: cần dữ liệu ván cờ úp ở quy mô chúng tôi không có, và đây là thay đổi duy nhất sẽ cải thiện nhiều nhất cả con bot lẫn phần phân tích trên trang này. Nếu bạn huấn luyện được mạng nơ-ron, hoặc bạn rành cờ úp đủ để chỉ ra hàm đánh giá sai ở đâu, đó là đóng góp chúng tôi mong nhất.',
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
