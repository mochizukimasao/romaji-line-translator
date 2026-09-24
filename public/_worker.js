var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// lib/google-auth.js
var GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
var SESSION_COOKIE = "__Host-romaji_session";
var SESSION_SECONDS = 12 * 60 * 60;
var googleKeyCache = { keys: null, expiresAt: 0 };
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(decodeBase64Url, "decodeBase64Url");
function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(encodeBase64Url, "encodeBase64Url");
function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}
__name(decodeJsonPart, "decodeJsonPart");
function getAllowedEmails(env) {
  return String(env.GOOGLE_ALLOWED_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}
__name(getAllowedEmails, "getAllowedEmails");
function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  for (const cookie of cookies.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    return cookie.slice(separator + 1).trim();
  }
  return "";
}
__name(getCookie, "getCookie");
async function getGoogleKeys(forceRefresh = false) {
  if (!forceRefresh && googleKeyCache.keys && googleKeyCache.expiresAt > Date.now()) {
    return googleKeyCache.keys;
  }
  const response = await fetch(GOOGLE_CERTS_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error("google_keys_unavailable");
  const body = await response.json();
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error("google_keys_invalid");
  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  googleKeyCache.keys = body.keys;
  googleKeyCache.expiresAt = Date.now() + Math.max(60, Math.min(maxAge, 21600)) * 1e3;
  return body.keys;
}
__name(getGoogleKeys, "getGoogleKeys");
async function verifyGoogleIdToken(token, clientId) {
  if (typeof token !== "string" || token.length > 2e4) throw new Error("invalid_token");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("invalid_token");
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const claims = decodeJsonPart(encodedClaims);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("invalid_algorithm");
  let keys = await getGoogleKeys();
  let jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
  if (!jwk) {
    keys = await getGoogleKeys(true);
    jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
  }
  if (!jwk) throw new Error("unknown_signing_key");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signedContent = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(encodedSignature),
    signedContent
  );
  if (!validSignature) throw new Error("invalid_signature");
  const now = Math.floor(Date.now() / 1e3);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) || !audiences.includes(clientId) || claims.azp !== void 0 && claims.azp !== clientId || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 || typeof claims.sub !== "string" || !claims.sub.trim() || typeof claims.email !== "string" || !claims.email.trim() || !(claims.email_verified === true || claims.email_verified === "true")) throw new Error("invalid_claims");
  return { email: claims.email.trim().toLowerCase(), sub: claims.sub.trim() };
}
__name(verifyGoogleIdToken, "verifyGoogleIdToken");
async function importSessionKey(secret) {
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("session_secret_invalid");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(importSessionKey, "importSessionKey");
async function createSessionCookie(identity, env) {
  const key = await importSessionKey(env.GOOGLE_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1e3);
  const payload = encodeBase64Url(JSON.stringify({
    iss: "romaji-line-translator",
    email: identity.email,
    sub: identity.sub,
    iat: now,
    exp: now + SESSION_SECONDS
  }));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${SESSION_COOKIE}=${payload}.${encodeBase64Url(signature)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}
__name(createSessionCookie, "createSessionCookie");
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
__name(clearSessionCookie, "clearSessionCookie");
async function getAuthorizedIdentity(request, env) {
  const allowedEmails = getAllowedEmails(env);
  const secret = env.GOOGLE_SESSION_SECRET;
  if (!allowedEmails.length || !secret || new TextEncoder().encode(String(secret)).byteLength < 32) {
    return { ok: false, status: 503, error: "Google\u30ED\u30B0\u30A4\u30F3\u306E\u8A2D\u5B9A\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002" };
  }
  const value = getCookie(request, SESSION_COOKIE);
  if (!value) return { ok: false, status: 401, error: "Google\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" };
  try {
    const parts = value.split(".");
    if (parts.length !== 2) throw new Error("invalid_session");
    const [payloadPart, signaturePart] = parts;
    const key = await importSessionKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signaturePart),
      new TextEncoder().encode(payloadPart)
    );
    if (!valid) throw new Error("invalid_session_signature");
    const session = decodeJsonPart(payloadPart);
    const now = Math.floor(Date.now() / 1e3);
    const email = String(session.email || "").trim().toLowerCase();
    const sub = String(session.sub || "").trim();
    if (session.iss !== "romaji-line-translator" || !Number.isFinite(session.exp) || session.exp <= now || !Number.isFinite(session.iat) || session.iat > now + 60 || !email || !sub) throw new Error("invalid_session_claims");
    if (!allowedEmails.includes(email)) {
      return { ok: false, status: 403, error: "\u3053\u306EGoogle\u30A2\u30AB\u30A6\u30F3\u30C8\u306B\u306F\u5229\u7528\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" };
    }
    return { ok: true, email, sub };
  } catch {
    return { ok: false, status: 401, error: "\u30ED\u30B0\u30A4\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F\u3002\u518D\u5EA6\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
  }
}
__name(getAuthorizedIdentity, "getAuthorizedIdentity");
function isSameOriginPost(request) {
  if (request.method !== "POST" && request.method !== "DELETE") return true;
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
__name(isSameOriginPost, "isSameOriginPost");

// api/auth/config.js
function onRequestGet({ env }) {
  const secretLength = new TextEncoder().encode(String(env.GOOGLE_SESSION_SECRET || "")).byteLength;
  if (!env.GOOGLE_CLIENT_ID || !getAllowedEmails(env).length || secretLength < 32) {
    return Response.json({ error: "Google\u30ED\u30B0\u30A4\u30F3\u306E\u8A2D\u5B9A\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }
  return Response.json({ clientId: env.GOOGLE_CLIENT_ID }, {
    headers: { "Cache-Control": "no-store" }
  });
}
__name(onRequestGet, "onRequestGet");

// lib/read-json-limited.js
async function readJsonLimited(request, maxBytes = 1e6) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return { ok: false, tooLarge: true };
  if (!request.body) return { ok: false, tooLarge: false };
  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}
__name(readJsonLimited, "readJsonLimited");
function hasJsonContentType(request) {
  return /^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "");
}
__name(hasJsonContentType, "hasJsonContentType");

// api/auth/session.js
function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers }
  });
}
__name(json, "json");
async function onRequestGet2({ request, env }) {
  const identity = await getAuthorizedIdentity(request, env);
  if (!identity.ok) return json({ error: identity.error }, identity.status);
  return json({ authenticated: true, user: { email: identity.email } });
}
__name(onRequestGet2, "onRequestGet");
async function onRequestPost({ request, env }) {
  if (!isSameOriginPost(request)) return json({ error: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u5143\u3067\u3059\u3002" }, 403);
  if (!hasJsonContentType(request)) return json({ error: "JSON\u5F62\u5F0F\u3067\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 415);
  const parsed = await readJsonLimited(request, 24e3);
  if (parsed.tooLarge) return json({ error: "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u5927\u304D\u3059\u304E\u307E\u3059\u3002" }, 413);
  if (!parsed.ok) return json({ error: "\u30ED\u30B0\u30A4\u30F3\u60C5\u5831\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" }, 400);
  const token = parsed.value?.credential;
  if (typeof token !== "string" || token.length > 2e4) {
    return json({ error: "Google\u30ED\u30B0\u30A4\u30F3\u60C5\u5831\u304C\u3042\u308A\u307E\u305B\u3093\u3002" }, 400);
  }
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const allowedEmails = getAllowedEmails(env);
  const secretLength = new TextEncoder().encode(String(env.GOOGLE_SESSION_SECRET || "")).byteLength;
  if (!clientId || !allowedEmails.length || secretLength < 32) {
    return json({ error: "Google\u30ED\u30B0\u30A4\u30F3\u306E\u8A2D\u5B9A\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002" }, 503);
  }
  try {
    const identity = await verifyGoogleIdToken(token, clientId);
    if (!allowedEmails.includes(identity.email)) {
      return json({ error: "\u3053\u306EGoogle\u30A2\u30AB\u30A6\u30F3\u30C8\u306B\u306F\u5229\u7528\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" }, 403);
    }
    const cookie = await createSessionCookie(identity, env);
    return json({ authenticated: true, user: { email: identity.email } }, 200, { "Set-Cookie": cookie });
  } catch {
    return json({ error: "Google\u30ED\u30B0\u30A4\u30F3\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002" }, 401);
  }
}
__name(onRequestPost, "onRequestPost");
function onRequestDelete({ request }) {
  if (!isSameOriginPost(request)) return json({ error: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u5143\u3067\u3059\u3002" }, 403);
  return json({ authenticated: false }, 200, { "Set-Cookie": clearSessionCookie() });
}
__name(onRequestDelete, "onRequestDelete");

// api/history.js
var HISTORY_LIMIT = 10;
var MAX_TEXT_LENGTH = 12e4;
function json2(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
__name(json2, "json");
async function onRequestGet3({ request, env }) {
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json2({ error: auth.error }, auth.status);
  if (!env.HISTORY_DB) return json2({ error: "\u5C65\u6B74\u4FDD\u5B58\u306E\u8A2D\u5B9A\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002" }, 503);
  const { results } = await env.HISTORY_DB.prepare(
    "SELECT id, mode, source, result, created_at AS createdAt FROM history WHERE user_email = ? AND user_sub = ? ORDER BY created_at DESC, rowid DESC LIMIT ?"
  ).bind(auth.email, auth.sub, HISTORY_LIMIT).all();
  return json2({ history: results || [] });
}
__name(onRequestGet3, "onRequestGet");
async function onRequestPost2({ request, env }) {
  if (!isSameOriginPost(request)) return json2({ error: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u5143\u3067\u3059\u3002" }, 403);
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json2({ error: auth.error }, auth.status);
  if (!env.HISTORY_DB) return json2({ error: "\u5C65\u6B74\u4FDD\u5B58\u306E\u8A2D\u5B9A\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002" }, 503);
  if (!hasJsonContentType(request)) return json2({ error: "JSON\u5F62\u5F0F\u3067\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 415);
  const parsed = await readJsonLimited(request);
  if (parsed.tooLarge) return json2({ error: "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u5927\u304D\u3059\u304E\u307E\u3059\u3002" }, 413);
  if (!parsed.ok) return json2({ error: "JSON\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" }, 400);
  const { mode, source, result } = parsed.value || {};
  if (!["romaji", "japanese"].includes(mode) || typeof source !== "string" || !source.trim() || source.length > MAX_TEXT_LENGTH || typeof result !== "string" || !result.trim() || result.length > MAX_TEXT_LENGTH) return json2({ error: "\u5C65\u6B74\u306E\u5185\u5BB9\u304C\u4E0D\u6B63\u304B\u3001\u9577\u3059\u304E\u307E\u3059\u3002" }, 400);
  const id = crypto.randomUUID();
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.HISTORY_DB.batch([
    env.HISTORY_DB.prepare(
      "INSERT INTO history (id, user_email, user_sub, mode, source, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, auth.email, auth.sub, mode, source, result, createdAt),
    env.HISTORY_DB.prepare(
      "DELETE FROM history WHERE user_email = ? AND user_sub = ? AND id NOT IN (SELECT id FROM history WHERE user_email = ? AND user_sub = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)"
    ).bind(auth.email, auth.sub, auth.email, auth.sub, HISTORY_LIMIT)
  ]);
  const { results } = await env.HISTORY_DB.prepare(
    "SELECT id, mode, source, result, created_at AS createdAt FROM history WHERE user_email = ? AND user_sub = ? ORDER BY created_at DESC, rowid DESC LIMIT ?"
  ).bind(auth.email, auth.sub, HISTORY_LIMIT).all();
  return json2({ history: results || [] }, 201);
}
__name(onRequestPost2, "onRequestPost");

// ../src/lib/gemini.js
var GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
var DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
var BATCH_SIZE = 8;
var REQUEST_TIMEOUT_MS = 1e4;
var MAX_REQUEST_ATTEMPTS = 2;
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
var RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          output: { type: "string" }
        },
        required: ["id", "output"]
      }
    }
  },
  required: ["results"]
};
var PROTECTED_TOKEN = /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[@#][\w-]+|\b(?:AI|OK|LINE|Zoom|Google|ChatGPT)\b|\b\d+(?:[/:.-]\d+)*\b/g;
var PRODUCT_ALIASES = /* @__PURE__ */ new Map([
  ["AI", ["AI", "\u30A8\u30FC\u30A2\u30A4"]],
  ["OK", ["OK", "\u30AA\u30FC\u30B1\u30FC", "\u30AA\u30FC\u30B1\u30A4"]],
  ["LINE", ["LINE", "\u30E9\u30A4\u30F3"]],
  ["Zoom", ["Zoom", "\u30BA\u30FC\u30E0"]],
  ["Google", ["Google", "\u30B0\u30FC\u30B0\u30EB"]],
  ["ChatGPT", ["ChatGPT", "\u30C1\u30E3\u30C3\u30C8\u30B8\u30FC\u30D4\u30FC\u30C6\u30A3\u30FC"]]
]);
var JAPANESE_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;
function buildTranslatePrompt(mode, items) {
  const goal = mode === "japanese" ? "\u65E5\u672C\u8A9E\u306E\u610F\u5473\u3001\u767A\u8A00\u5185\u5BB9\u3001\u56FA\u6709\u540D\u8A5E\u3001\u6570\u5B57\u3001\u8A9E\u8ABF\u3092\u4FDD\u3063\u305F\u307E\u307E\u3001\u52A9\u8A5E\u30FB\u53E5\u8AAD\u70B9\u30FB\u660E\u767D\u306A\u8A9E\u9806\u306E\u5D29\u308C\u3060\u3051\u3092\u6700\u5C0F\u9650\u4FEE\u6B63\u3059\u308B\u3002" : "\u30ED\u30FC\u30DE\u5B57\u3092\u6587\u8108\u306B\u5FDC\u3058\u305F\u81EA\u7136\u306A\u6F22\u5B57\u304B\u306A\u4EA4\u3058\u308A\u6587\u3078\u5909\u63DB\u3057\u3001\u610F\u5473\u3001\u8A9E\u9806\u3001\u8A9E\u8ABF\u3001\u4E01\u5BE7\u3055\u3001\u65AD\u5B9A\u306E\u5F37\u3055\u3092\u5909\u3048\u306A\u3044\u3002";
  return [
    "\u3042\u306A\u305F\u306F\u6B63\u78BA\u306A\u65E5\u672C\u8A9E\u5909\u63DB\u30A8\u30C7\u30A3\u30BF\u3067\u3059\u3002",
    `\u76EE\u7684: ${goal}`,
    "\u8981\u7D04\u3001\u8AAC\u660E\u3001\u60C5\u5831\u8FFD\u52A0\u3001\u8A55\u4FA1\u3001\u88C5\u98FE\u7684\u306A\u8A00\u3044\u63DB\u3048\u3092\u3057\u306A\u3044\u3002\u5165\u529B\u306E\u9806\u5E8F\u3068\u9805\u76EE\u6570\u3092\u5FC5\u305A\u4FDD\u3064\u3002",
    "URL\u3001\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3001@mention\u3001#hashtag\u3001\u6570\u5B57\u3001\u65E5\u6642\u3001\u5143\u5165\u529B\u306E\u65E5\u672C\u8A9E\u3001LINE\u30FBZoom\u30FBGoogle\u30FBChatGPT\u306A\u3069\u306E\u88FD\u54C1\u540D\u30FB\u7565\u8A9E\u3001\u4EBA\u540D\u30FB\u5730\u540D\u30FB\u7D44\u7E54\u540D\u306F\u52DD\u624B\u306B\u5225\u8A9E\u3078\u7F6E\u63DB\u3057\u306A\u3044\u3002",
    "\u51FA\u529B\u306BLatin\u6587\u5B57\u3092\u6B8B\u3059\u5834\u5408\u306F\u3001\u5143\u5165\u529B\u306B\u3042\u308B\u4FDD\u8B77\u5BFE\u8C61\u30C8\u30FC\u30AF\u30F3\u3068\u5B8C\u5168\u4E00\u81F4\u3059\u308B\u3082\u306E\u3060\u3051\u8A31\u53EF\u3059\u308B\u3002",
    mode === "romaji" ? "\u5B89\u5168\u306B\u65AD\u5B9A\u3067\u304D\u306A\u3044\u56FA\u6709\u540D\u8A5E\u306F\u539F\u8868\u8A18\u307E\u305F\u306F\u30AB\u30BF\u30AB\u30CA\u3092\u512A\u5148\u3057\u3001ASCII\u53E5\u8AAD\u70B9\u306F\u5FC5\u8981\u306B\u5FDC\u3058\u3066\u65E5\u672C\u8A9E\u53E5\u8AAD\u70B9\u3078\u6B63\u898F\u5316\u3059\u308B\u3002" : "\u3060\u30FB\u3067\u3042\u308B\u8ABF\u3068\u3067\u3059\u30FB\u307E\u3059\u8ABF\u3092\u76F8\u4E92\u5909\u63DB\u3057\u306A\u3044\u3002\u5185\u5BB9\u3092\u524A\u9664\u30FB\u7D71\u5408\u3057\u306A\u3044\u3002",
    'JSON\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8 {"results":[{"id":"\u5165\u529Bid","output":"\u5909\u63DB\u7D50\u679C"}]} \u3060\u3051\u3092\u8FD4\u3059\u3002\u5168\u9805\u76EE\u3092\u540C\u3058\u9806\u5E8F\u3067\u8FD4\u3059\u3002',
    "",
    JSON.stringify({ mode, items: items.map(({ id, text }) => ({ id, text })) })
  ].join("\n");
}
__name(buildTranslatePrompt, "buildTranslatePrompt");
function safeString(value) {
  return String(value ?? "");
}
__name(safeString, "safeString");
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
__name(wait, "wait");
function createError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
__name(createError, "createError");
function isRetryableError(error) {
  return error?.code === "timeout" || error?.code === "rate_limit" || error?.code === "transient_service";
}
__name(isRetryableError, "isRetryableError");
function parseResponse(text) {
  const parsed = JSON.parse(text);
  const results = Array.isArray(parsed) ? parsed : parsed?.results;
  if (!Array.isArray(results)) throw new Error("invalid_json");
  return results.map((item) => typeof item === "string" ? { output: item } : item);
}
__name(parseResponse, "parseResponse");
function validateOutput(mode, source, output) {
  const value = safeString(output).trimEnd();
  if (!value.trim()) return false;
  if (mode === "japanese" && value.replace(/\s/g, "").length < source.replace(/\s/g, "").length * 0.35) return false;
  if (mode === "romaji") {
    let remainingJapanese = value;
    for (const run of source.match(JAPANESE_RUN) || []) {
      if (!remainingJapanese.includes(run)) return false;
      remainingJapanese = remainingJapanese.replace(run, "");
    }
  }
  const protectedTokens = source.match(PROTECTED_TOKEN) || [];
  let remaining = value;
  for (const token of protectedTokens) {
    const alternatives = PRODUCT_ALIASES.get(token) || [token];
    const matched = alternatives.find((candidate) => remaining.includes(candidate));
    if (!matched) return false;
    remaining = remaining.replace(matched, "");
  }
  if (mode === "romaji" && /[A-Za-z]/.test(value)) {
    if (/[A-Za-z]/.test(remaining)) return false;
  }
  return mode === "japanese" || /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value) || protectedTokens.length > 0;
}
__name(validateOutput, "validateOutput");
async function requestBatch(items, { apiKey, model, mode }) {
  if (!apiKey) throw createError("configuration");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildTranslatePrompt(mode, items) }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
      })
    });
  } catch (error) {
    if (controller.signal.aborted) throw createError("timeout");
    throw createError("transient_service");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    if (response.status === 429) throw createError("rate_limit");
    if (RETRYABLE_STATUS_CODES.has(response.status)) throw createError("transient_service");
    throw createError("service");
  }
  const data = await response.json().catch(() => {
    throw new Error("invalid_json");
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("invalid_json");
  const results = parseResponse(text);
  if (results.length !== items.length) throw new Error("count_mismatch");
  const byId = new Map(results.map((result) => [result.id, result]));
  return items.map((item) => {
    const result = byId.get(item.id);
    if (!result || !validateOutput(mode, item.text, result.output)) throw new Error("validation");
    return { id: item.id, status: "ok", output: safeString(result.output).trimEnd(), errorCode: null };
  });
}
__name(requestBatch, "requestBatch");
async function requestBatchWithRetry(items, options) {
  let lastError;
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await requestBatch(items, options);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === MAX_REQUEST_ATTEMPTS - 1) throw error;
      await wait(300 + Math.floor(Math.random() * 200));
    }
  }
  throw lastError;
}
__name(requestBatchWithRetry, "requestBatchWithRetry");
async function translateIsolatedItems(items, options, batchError) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = /* @__PURE__ */ __name(async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      try {
        results[index] = (await requestBatchWithRetry([item], options))[0];
      } catch (itemError) {
        results[index] = { id: item.id, status: "error", output: "", errorCode: errorCode(itemError || batchError) };
      }
    }
  }, "worker");
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
  return results;
}
__name(translateIsolatedItems, "translateIsolatedItems");
function errorCode(error) {
  const code = error?.code || error?.message;
  return ["configuration", "service", "transient_service", "rate_limit", "timeout", "invalid_json", "count_mismatch", "validation"].includes(code) ? code : "service";
}
__name(errorCode, "errorCode");
async function translateItems(items, { apiKey, model = DEFAULT_GEMINI_MODEL, mode = "romaji" } = {}) {
  const results = [];
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    const chunk = items.slice(index, index + BATCH_SIZE);
    try {
      results.push(...await requestBatchWithRetry(chunk, { apiKey, model, mode }));
    } catch (batchError) {
      if (isRetryableError(batchError)) {
        results.push(...chunk.map((item) => ({ id: item.id, status: "error", output: "", errorCode: errorCode(batchError) })));
      } else {
        results.push(...await translateIsolatedItems(chunk, { apiKey, model, mode }, batchError));
      }
    }
  }
  return results;
}
__name(translateItems, "translateItems");

// ../src/lib/api-request.js
var API_LIMITS = {
  maxItems: 1e3,
  maxIdLength: 200,
  maxItemLength: 4e3,
  maxTotalLength: 12e4
};
function invalid(error) {
  return { ok: false, status: 400, error };
}
__name(invalid, "invalid");
function validateTranslateRequest(body) {
  const mode = body?.mode === void 0 ? "romaji" : body.mode;
  if (mode !== "romaji" && mode !== "japanese") return invalid("\u5909\u63DB\u30E2\u30FC\u30C9\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  if (!Array.isArray(body?.items) || !body.items.length || body.items.length > API_LIMITS.maxItems) {
    return invalid(`1\u301C${API_LIMITS.maxItems}\u9805\u76EE\u306E\u5165\u529B\u3092\u9001\u3063\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  const ids = /* @__PURE__ */ new Set();
  let totalLength = 0;
  const items = [];
  for (const item of body.items) {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string" || !item.id.trim() || !item.text.trim()) {
      return invalid("\u9805\u76EE\u306Eid\u3068text\u306B\u306F\u7A7A\u3067\u306A\u3044\u6587\u5B57\u5217\u304C\u5FC5\u8981\u3067\u3059\u3002");
    }
    if (item.id.length > API_LIMITS.maxIdLength) return invalid("\u9805\u76EE\u306Eid\u304C\u9577\u3059\u304E\u307E\u3059\u3002");
    if (item.text.length > API_LIMITS.maxItemLength) return invalid("1\u9805\u76EE\u306E\u5165\u529B\u304C\u9577\u3059\u304E\u307E\u3059\u3002");
    if (ids.has(item.id)) return invalid("\u9805\u76EE\u306Eid\u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059\u3002");
    ids.add(item.id);
    totalLength += item.text.length;
    items.push({ id: item.id, text: item.text });
  }
  if (totalLength > API_LIMITS.maxTotalLength) return invalid("\u5165\u529B\u304C\u9577\u3059\u304E\u307E\u3059\u3002\u5C11\u3057\u5206\u3051\u3066\u5909\u63DB\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  return { ok: true, mode, items };
}
__name(validateTranslateRequest, "validateTranslateRequest");

// api/translate.js
function json3(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
__name(json3, "json");
async function onRequestPost3(context) {
  const { request, env } = context;
  if (!isSameOriginPost(request)) return json3({ error: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u5143\u3067\u3059\u3002" }, 403);
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json3({ error: auth.error }, auth.status);
  if (!hasJsonContentType(request)) return json3({ error: "JSON\u5F62\u5F0F\u3067\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 415);
  const parsed = await readJsonLimited(request);
  if (parsed.tooLarge) return json3({ error: "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u5927\u304D\u3059\u304E\u307E\u3059\u3002" }, 413);
  if (!parsed.ok) return json3({ error: "JSON\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" }, 400);
  const body = parsed.value;
  const validation = validateTranslateRequest(body);
  if (!validation.ok) return json3({ error: validation.error }, validation.status);
  if (!env.GEMINI_API_KEY) return json3({ error: "\u5909\u63DB\u30B5\u30FC\u30D3\u30B9\u306E\u8A2D\u5B9A\u304C\u3042\u308A\u307E\u305B\u3093\u3002" }, 500);
  try {
    const results = await translateItems(validation.items, {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      mode: validation.mode
    });
    return json3({ results });
  } catch {
    return json3({ error: "\u5909\u63DB\u30B5\u30FC\u30D3\u30B9\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002" }, 503);
  }
}
__name(onRequestPost3, "onRequestPost");

// ../.wrangler/tmp/pages-05St13/functionsRoutes-0.3990662004882125.mjs
var routes = [
  {
    routePath: "/api/auth/config",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/auth/session",
    mountPath: "/api/auth",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/auth/session",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/auth/session",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/history",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/history",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/translate",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  }
];

// ../../../../.npm/_npx/2d6078b16d31eafe/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../.npm/_npx/2d6078b16d31eafe/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
