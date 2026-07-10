// Video theme: the class styles the board SVG relies on, inlined as a <style>
// block because frames rasterize outside the DOM (no app stylesheets). Values
// mirror live-xiangqi.css defaults; the channel look is locked here so a
// product retheme never silently changes the back catalog.

export const VIDEO_BACKGROUND = '#12161c';

export const VIDEO_BOARD_STYLE = `
  .xq-live-bg { fill: #f5dca8; }
  .xq-live-line { stroke: #5a3a14; stroke-width: 1.2; }
  .xq-live-palace-band { fill: rgba(255, 255, 255, 0); }
  .xq-live-palace line { stroke: #5a3a14; stroke-width: 1.2; }
  .xq-live-river-label {
    display: block;
    fill: #5a3a14;
    font-family: 'Songti SC', 'PingFang SC', serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 4px;
    text-anchor: middle;
    dominant-baseline: central;
    opacity: 0.85;
  }
  .xq-live-lastmove-cell { fill: #f59e0b; opacity: 0.26; }
  .xq-live-lastmove-from { fill: #a16207; opacity: 0.34; }
  .xq-live-lastmove-ring {
    fill: none;
    stroke: #d6af4e;
    stroke-width: 4;
  }
  .xq-live-selection-cell { fill: rgba(31, 111, 91, 0.32); stroke: none; }
  .xq-live-hint-dot { fill: rgba(31, 111, 91, 0.72); opacity: 0.9; }
  .xq-live-hint-capture { fill: none; stroke: rgba(31, 111, 91, 0.48); stroke-width: 3; }
  .xqv-dim { fill: rgba(10, 8, 4, 0.42); }
  .xqv-glow-ring {
    fill: none;
    stroke: #e8b64c;
    stroke-width: 5;
  }
  .xqv-region { fill: rgba(46, 134, 222, 0.22); stroke: rgba(46, 134, 222, 0.55); stroke-width: 2; }
  .xqv-flash-ring { fill: none; stroke: #d64545; stroke-width: 5; }
  .xqv-flash-arrow { stroke: #d64545; fill: #d64545; }
`;
