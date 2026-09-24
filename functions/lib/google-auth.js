const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_COOKIE = '__Host-romaji_session';
const SESSION_SECONDS = 12 * 60 * 60;
const googleKeyCache = { keys: null, expiresAt: 0 };

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value) {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function getAllowedEmails(env) {
  return String(env.GOOGLE_ALLOWED_EMAILS || '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const cookie of cookies.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    return cookie.slice(separator + 1).trim();
  }
  return '';
}

async function getGoogleKeys(forceRefresh = false) {
  if (!forceRefresh && googleKeyCache.keys && googleKeyCache.expiresAt > Date.now()) {
    return googleKeyCache.keys;
  }
  const response = await fetch(GOOGLE_CERTS_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error('google_keys_unavailable');
  const body = await response.json();
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error('google_keys_invalid');
  const cacheControl = response.headers.get('Cache-Control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  googleKeyCache.keys = body.keys;
  googleKeyCache.expiresAt = Date.now() + Math.max(60, Math.min(maxAge, 21600)) * 1000;
  return body.keys;
}

export async function verifyGoogleIdToken(token, clientId) {
  if (typeof token !== 'string' || token.length > 20000) throw new Error('invalid_token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('invalid_token');
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const claims = decodeJsonPart(encodedClaims);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('invalid_algorithm');

  let keys = await getGoogleKeys();
  let jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
  if (!jwk) {
    keys = await getGoogleKeys(true);
    jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
  }
  if (!jwk) throw new Error('unknown_signing_key');

  const publicKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const signedContent = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const validSignature = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', publicKey, decodeBase64Url(encodedSignature), signedContent
  );
  if (!validSignature) throw new Error('invalid_signature');

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    !audiences.includes(clientId) ||
    (claims.azp !== undefined && claims.azp !== clientId) ||
    !Number.isFinite(claims.exp) || claims.exp <= now ||
    !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
    typeof claims.sub !== 'string' || !claims.sub.trim() ||
    typeof claims.email !== 'string' || !claims.email.trim() ||
    !(claims.email_verified === true || claims.email_verified === 'true')
  ) throw new Error('invalid_claims');

  return { email: claims.email.trim().toLowerCase(), sub: claims.sub.trim() };
}

async function importSessionKey(secret) {
  if (typeof secret !== 'string' || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error('session_secret_invalid');
  }
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function createSessionCookie(identity, env) {
  const key = await importSessionKey(env.GOOGLE_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeBase64Url(JSON.stringify({
    iss: 'romaji-line-translator',
    email: identity.email,
    sub: identity.sub,
    iat: now,
    exp: now + SESSION_SECONDS
  }));
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${SESSION_COOKIE}=${payload}.${encodeBase64Url(signature)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function getAuthorizedIdentity(request, env) {
  const allowedEmails = getAllowedEmails(env);
  const secret = env.GOOGLE_SESSION_SECRET;
  if (!allowedEmails.length || !secret || new TextEncoder().encode(String(secret)).byteLength < 32) {
    return { ok: false, status: 503, error: 'Googleログインの設定が完了していません。' };
  }
  const value = getCookie(request, SESSION_COOKIE);
  if (!value) return { ok: false, status: 401, error: 'Googleログインが必要です。' };
  try {
    const parts = value.split('.');
    if (parts.length !== 2) throw new Error('invalid_session');
    const [payloadPart, signaturePart] = parts;
    const key = await importSessionKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart)
    );
    if (!valid) throw new Error('invalid_session_signature');
    const session = decodeJsonPart(payloadPart);
    const now = Math.floor(Date.now() / 1000);
    const email = String(session.email || '').trim().toLowerCase();
    const sub = String(session.sub || '').trim();
    if (
      session.iss !== 'romaji-line-translator' || !Number.isFinite(session.exp) ||
      session.exp <= now || !Number.isFinite(session.iat) || session.iat > now + 60 ||
      !email || !sub
    ) throw new Error('invalid_session_claims');
    if (!allowedEmails.includes(email)) {
      return { ok: false, status: 403, error: 'このGoogleアカウントには利用権限がありません。' };
    }
    return { ok: true, email, sub };
  } catch {
    return { ok: false, status: 401, error: 'ログインの有効期限が切れました。再度ログインしてください。' };
  }
}

export function isSameOriginPost(request) {
  if (request.method !== 'POST' && request.method !== 'DELETE') return true;
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export { getAllowedEmails };
