/**
 * OGS OAuth2 with PKCE.
 *
 * Verified against https://docs.online-go.com/oauth2.html:
 *   authorize  https://online-go.com/oauth2/authorize/
 *   token      https://online-go.com/oauth2/token/
 *   revoke     https://online-go.com/oauth2/revoke_token/
 *   userinfo   https://online-go.com/oauth2/userinfo/
 *
 * Public clients (this app) MUST use PKCE and must never hold a client_secret.
 * The client_id is user-supplied because a static site cannot own a registered
 * redirect URI; the UI explains that plainly.
 */

const AUTHORIZE = 'https://online-go.com/oauth2/authorize/';
const TOKEN = 'https://online-go.com/oauth2/token/';
const REVOKE = 'https://online-go.com/oauth2/revoke_token/';
const USERINFO = 'https://online-go.com/oauth2/userinfo/';

const VERIFIER_KEY = 'gomaster.ogs.verifier';
const STATE_KEY = 'gomaster.ogs.state';
const TOKEN_KEY = 'gomaster.ogs.token';
const CLIENT_KEY = 'gomaster.ogs.client';
const REDIRECT_KEY = 'gomaster.ogs.redirect';

export interface OgsTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
}

export interface OgsUser {
  id: number;
  username: string;
  country?: string;
  icon?: string;
  ranking?: number;
}

export interface OgsConfig {
  clientId: string;
  /** Redirect URI registered with the OGS application. */
  redirectUri: string;
}

/* ------------------------------------------------------------------------- */
/* PKCE helpers                                                              */
/* ------------------------------------------------------------------------- */

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomVerifier(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // Restrict to the RFC 7636 unreserved set.
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  for (const b of bytes) out += charset[b % charset.length];
  return out;
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/* ------------------------------------------------------------------------- */
/* Config + token storage                                                    */
/* ------------------------------------------------------------------------- */

export function loadConfig(): OgsConfig {
  try {
    const raw = localStorage.getItem(CLIENT_KEY);
    if (raw) return JSON.parse(raw) as OgsConfig;
  } catch {
    /* ignore */
  }
  return { clientId: '', redirectUri: `${location.origin}${location.pathname}` };
}

export function saveConfig(cfg: OgsConfig) {
  localStorage.setItem(CLIENT_KEY, JSON.stringify(cfg));
}

export function loadTokens(): OgsTokens | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as OgsTokens;
    if (!t.access_token) return null;
    return t;
  } catch {
    return null;
  }
}

function storeTokens(t: OgsTokens, persist: boolean) {
  const json = JSON.stringify(t);
  sessionStorage.setItem(TOKEN_KEY, json);
  if (persist) localStorage.setItem(TOKEN_KEY, json);
}

export function clearTokens() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  const t = loadTokens();
  return Boolean(t && t.expires_at > Date.now());
}

/* ------------------------------------------------------------------------- */
/* Authorization flow                                                        */
/* ------------------------------------------------------------------------- */

/** Build the authorize URL and stash the PKCE verifier + state. */
export async function beginLogin(cfg: OgsConfig): Promise<string> {
  const verifier = randomVerifier();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(REDIRECT_KEY, cfg.redirectUri);
  saveConfig(cfg);
  const challenge = await challengeFor(verifier);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    scope: 'read write',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE}?${params.toString()}`;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

/**
 * Handle the redirect back from OGS. Returns `null` when there is nothing to do
 * (no `code` in the URL), so the app can boot normally.
 */
export async function completeLogin(search: string, persist = false): Promise<LoginResult | null> {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const error = params.get('error');
  if (error) return { ok: false, error: params.get('error_description') ?? error };
  if (!code) return null;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const state = params.get('state');
  if (expectedState && state !== expectedState) {
    return { ok: false, error: 'state 不匹配，已中止（可能是 CSRF）' };
  }
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const cfg = loadConfig();
  const redirectUri = sessionStorage.getItem(REDIRECT_KEY) ?? cfg.redirectUri;
  if (!verifier) return { ok: false, error: '缺少 PKCE verifier，请重新登录' };

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      code_verifier: verifier,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `换取令牌失败（HTTP ${res.status}）${text.slice(0, 120)}` };
    }
    const data = (await res.json()) as OgsTokens & { expires_in?: number };
    storeTokens(
      {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        scope: data.scope,
        token_type: data.token_type,
        expires_at: Date.now() + (data.expires_in ?? 2592000) * 1000,
      },
      persist,
    );
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function refreshTokens(): Promise<boolean> {
  const t = loadTokens();
  const cfg = loadConfig();
  if (!t?.refresh_token) return false;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: cfg.clientId,
    });
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as OgsTokens & { expires_in?: number };
    storeTokens(
      {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? t.refresh_token,
        expires_at: Date.now() + (data.expires_in ?? 2592000) * 1000,
        scope: data.scope ?? t.scope,
      },
      Boolean(localStorage.getItem(TOKEN_KEY)),
    );
    return true;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  const t = loadTokens();
  const cfg = loadConfig();
  clearTokens();
  if (!t) return;
  try {
    await fetch(REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t.access_token, client_id: cfg.clientId }),
    });
  } catch {
    /* revocation is best-effort */
  }
}

/* ------------------------------------------------------------------------- */
/* REST                                                                      */
/* ------------------------------------------------------------------------- */

const API = 'https://online-go.com/api/v1';

export async function apiGet<T>(path: string): Promise<T> {
  const t = loadTokens();
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(t ? { Authorization: `Bearer ${t.access_token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`OGS API ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchMe(): Promise<OgsUser> {
  const t = loadTokens();
  if (!t) throw new Error('未登录');
  const res = await fetch(`${USERINFO}`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  if (res.ok) {
    const data = (await res.json()) as Partial<OgsUser>;
    if (data.username) return data as OgsUser;
  }
  // Fall back to the REST endpoint if the userinfo shape differs.
  const me = await apiGet<{ id: number; username: string; country?: string; icon?: string; ranking?: number }>('/me');
  return { id: me.id, username: me.username, country: me.country, icon: me.icon, ranking: me.ranking };
}

export interface OgsChallengeSummary {
  id: number;
  name?: string;
  board_size?: number;
  komi?: number;
  ranked?: boolean;
  challenger?: { id: number; username: string; ranking?: number };
  game?: { id: number };
  width?: number;
  height?: number;
}

/** Open challenges anyone can accept. */
export async function fetchOpenChallenges(): Promise<OgsChallengeSummary[]> {
  const data = await apiGet<{ results?: OgsChallengeSummary[] } | OgsChallengeSummary[]>('/challenges/?page_size=30');
  return Array.isArray(data) ? data : (data.results ?? []);
}

/** The games in which it is currently this player's turn. */
export async function fetchMyGames(): Promise<Array<{ id: number; black: number; white: number; move_number: number; phase: string }>> {
  const me = await fetchMe();
  const data = await apiGet<{ results?: Array<Record<string, unknown>> }>(`/players/${me.id}/games/?page_size=30`);
  return (data.results ?? []).map((g) => ({
    id: Number(g.id),
    black: Number(g.black),
    white: Number(g.white),
    move_number: Number(g.move_number ?? 0),
    phase: String(g.phase ?? ''),
  }));
}

export { AUTHORIZE, TOKEN };
