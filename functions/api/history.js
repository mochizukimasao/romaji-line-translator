import { getAuthorizedIdentity, isSameOriginPost } from '../lib/google-auth.js';
import { hasJsonContentType, readJsonLimited } from '../lib/read-json-limited.js';

const HISTORY_LIMIT = 10;
const MAX_TEXT_LENGTH = 120000;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function onRequestGet({ request, env }) {
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.HISTORY_DB) return json({ error: '履歴保存の設定が完了していません。' }, 503);
  const { results } = await env.HISTORY_DB.prepare(
    'SELECT id, mode, source, result, created_at AS createdAt FROM history WHERE user_email = ? AND user_sub = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'
  ).bind(auth.email, auth.sub, HISTORY_LIMIT).all();
  return json({ history: results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOriginPost(request)) return json({ error: '不正なリクエスト元です。' }, 403);
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.HISTORY_DB) return json({ error: '履歴保存の設定が完了していません。' }, 503);
  if (!hasJsonContentType(request)) return json({ error: 'JSON形式で送信してください。' }, 415);
  const parsed = await readJsonLimited(request);
  if (parsed.tooLarge) return json({ error: 'リクエストが大きすぎます。' }, 413);
  if (!parsed.ok) return json({ error: 'JSONを読み取れませんでした。' }, 400);
  const { mode, source, result } = parsed.value || {};
  if (
    !['romaji', 'japanese'].includes(mode) ||
    typeof source !== 'string' || !source.trim() || source.length > MAX_TEXT_LENGTH ||
    typeof result !== 'string' || !result.trim() || result.length > MAX_TEXT_LENGTH
  ) return json({ error: '履歴の内容が不正か、長すぎます。' }, 400);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.HISTORY_DB.batch([
    env.HISTORY_DB.prepare(
      'INSERT INTO history (id, user_email, user_sub, mode, source, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, auth.email, auth.sub, mode, source, result, createdAt),
    env.HISTORY_DB.prepare(
      'DELETE FROM history WHERE user_email = ? AND user_sub = ? AND id NOT IN (SELECT id FROM history WHERE user_email = ? AND user_sub = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)'
    ).bind(auth.email, auth.sub, auth.email, auth.sub, HISTORY_LIMIT)
  ]);
  const { results } = await env.HISTORY_DB.prepare(
    'SELECT id, mode, source, result, created_at AS createdAt FROM history WHERE user_email = ? AND user_sub = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'
  ).bind(auth.email, auth.sub, HISTORY_LIMIT).all();
  return json({ history: results || [] }, 201);
}
