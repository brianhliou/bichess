// Fetch helpers shared by the prod smoke scripts: every network step carries a
// timeout, and JSON parsing failures are shaped into errors that name the URL
// and quote the first bytes of the body instead of a bare SyntaxError.

export async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, { timeoutMs, init = {} }) {
  const response = await fetchWithTimeout(url, timeoutMs, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${url.pathname} returned non-JSON response: ${text.slice(0, 120)}`);
    }
  }
  return { status: response.status, body };
}

export async function fetchText(url, { timeoutMs, init = {} }) {
  const response = await fetchWithTimeout(url, timeoutMs, init);
  return { status: response.status, body: await response.text() };
}

// For call sites that need the Response (status branching) before parsing.
export async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response from ${response.url}: ${text.slice(0, 120)}`);
  }
}
