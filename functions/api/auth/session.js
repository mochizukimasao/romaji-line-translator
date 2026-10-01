import {
  clearSessionCookie,
  createSessionCookie,
  getAllowedEmails,
  getAuthorizedIdentity,
  isSameOriginPost,
  verifyGoogleIdToken,
  verifyGoogleAccessToken
} from '../../lib/google-auth.js';
import { hasJsonContentType, readJsonLimited } from '../../lib/read-json-limited.js';

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers }
  });
}

export async function onRequestGet({ request, env }) {
  const identity = await getAuthorizedIdentity(request, env);
  if (!identity.ok) return json({ error: identity.error }, identity.status);
  return json({ authenticated: true, user: { email: identity.email } });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOriginPost(request)) return json({ error: '不正なリクエスト元です。' }, 403);
  if (!hasJsonContentType(request)) return json({ error: 'JSON形式で送信してください。' }, 415);
  const parsed = await readJsonLimited(request, 24000);
  if (parsed.tooLarge) return json({ error: 'リクエストが大きすぎます。' }, 413);
  if (!parsed.ok) return json({ error: 'ログイン情報を読み取れませんでした。' }, 400);
  const credential = parsed.value?.credential;
  const accessToken = parsed.value?.accessToken;
  if ((!credential || typeof credential !== 'string' || credential.length > 20000) &&
      (!accessToken || typeof accessToken !== 'string' || accessToken.length > 8192)) {
    return json({ error: 'Googleログイン情報がありません。' }, 400);
  }

  const clientId = String(env.GOOGLE_CLIENT_ID || '').trim();
  const allowedEmails = getAllowedEmails(env);
  const secretLength = new TextEncoder().encode(String(env.GOOGLE_SESSION_SECRET || '')).byteLength;
  if (!clientId || !allowedEmails.length || secretLength < 32) {
    return json({ error: 'Googleログインの設定が完了していません。' }, 503);
  }
  try {
    const identity = credential
      ? await verifyGoogleIdToken(credential, clientId)
      : await verifyGoogleAccessToken(accessToken);
    if (!allowedEmails.includes(identity.email)) {
      return json({ error: 'このGoogleアカウントには利用権限がありません。' }, 403);
    }
    const cookie = await createSessionCookie(identity, env);
    return json({ authenticated: true, user: { email: identity.email } }, 200, { 'Set-Cookie': cookie });
  } catch {
    return json({ error: 'Googleログインを確認できませんでした。もう一度お試しください。' }, 401);
  }
}

export function onRequestDelete({ request }) {
  if (!isSameOriginPost(request)) return json({ error: '不正なリクエスト元です。' }, 403);
  return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie() });
}
