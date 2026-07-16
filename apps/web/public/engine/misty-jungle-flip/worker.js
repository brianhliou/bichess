// MistyBanqi client-engine worker. Runs the vendored wasm-bindgen build (banqi_wasm.js
// + banqi_wasm_bg.wasm) OFF the main thread, so a search never blocks the review UI. The
// wasm is single-threaded (no SharedArrayBuffer / cross-origin isolation needed), unlike
// the Fairy-Stockfish engine.
//
// The main thread (misty-ceval.ts) posts the versioned asset URLs in the `init` message,
// so cache-busting lives in one place there (ceval's asset-version constant) rather than
// in bare-path imports here. Message protocol:
//   → { type: 'init', jsUrl, wasmUrl }        ← { type: 'ready' } | { type: 'error', error }
//   → { type: 'analyze', id, fen, nodes, multipv }
//                                              ← { type: 'result', id, json }
//                                              ← { type: 'error', id, error }
let mod = null;
let readyPromise = null;

async function ensureReady(jsUrl, wasmUrl) {
  if (!readyPromise) {
    readyPromise = (async () => {
      mod = await import(jsUrl);
      await mod.default(wasmUrl); // default export = wasm-bindgen init(wasmUrl)
    })();
  }
  return readyPromise;
}

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await ensureReady(msg.jsUrl, msg.wasmUrl);
      self.postMessage({ type: 'ready' });
      return;
    }
    if (msg.type === 'analyze') {
      if (!mod) throw new Error('engine not initialized');
      const json = mod.analyze(msg.fen, msg.nodes, msg.multipv);
      self.postMessage({ type: 'result', id: msg.id, json });
    }
  } catch (err) {
    const error = String((err && err.message) || err);
    self.postMessage(msg && msg.type === 'analyze' ? { type: 'error', id: msg.id, error } : { type: 'error', error });
  }
};
