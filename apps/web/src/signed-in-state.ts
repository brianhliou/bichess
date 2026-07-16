// Lightweight signed-in state, deliberately dependency-free so it can be shared
// by account-nav (the authoritative owner that resolves /api/auth/me) and the
// read-only consumers (theme's gear gating, landing's contact form) without an
// account-nav <-> theme import cycle.

const SIGNED_IN_HINT_KEY = 'mb_signed_in';

// undefined until account-nav resolves auth this load; then the real boolean.
let resolvedSignedIn: boolean | undefined;

// Persisted best-guess from a prior signed-in load. Lets the first paint pick
// the right shape before /api/auth/me resolves.
export function readSignedInHint(): boolean {
  try {
    return window.localStorage.getItem(SIGNED_IN_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSignedInHint(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    else window.localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // localStorage unavailable (private mode etc.) — fall through.
  }
}

// account-nav pushes the authoritative result here: true/false once auth
// settles, or undefined to return to the unresolved (hint-only) state. Keeping
// this in sync with account-nav's cachedUser is what lets isLikelySignedIn live
// outside account-nav (and break the import cycle).
export function setResolvedSignedIn(value: boolean | undefined): void {
  resolvedSignedIn = value;
}

// Synchronous best guess used to choose the initial render shape: the resolved
// value if auth has settled this load, else the persisted hint. Stale only in
// edge cases (sign-out from another tab), reconciled by the auth fetch.
export function isLikelySignedIn(): boolean {
  if (resolvedSignedIn !== undefined) return resolvedSignedIn;
  return readSignedInHint();
}

// Admin hint, same shape as the signed-in hint: site-shell paints the
// admin-only nav links from it before /api/auth/me resolves, account-nav
// reconciles every [data-admin-only] element once auth settles. Purely
// cosmetic — /database and /engines are admin-gated server-side.
const ADMIN_HINT_KEY = 'mb_admin';

let resolvedAdmin: boolean | undefined;

export function readAdminHint(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAdminHint(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(ADMIN_HINT_KEY, '1');
    else window.localStorage.removeItem(ADMIN_HINT_KEY);
  } catch {
    // localStorage unavailable (private mode etc.) — fall through.
  }
}

export function setResolvedAdmin(value: boolean | undefined): void {
  resolvedAdmin = value;
}

export function isLikelyAdmin(): boolean {
  if (resolvedAdmin !== undefined) return resolvedAdmin;
  return readAdminHint();
}
