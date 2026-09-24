import { getAuthorizedIdentity, isSameOriginPost } from '../lib/google-auth.js';
import { hasJsonContentType, readJsonLimited } from '../lib/read-json-limited.js';

const ENTRY_LIMIT = 100;
const MAX_READING_LENGTH = 80;
const MAX_REPLACEMENT_LENGTH = 120;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function normalizeReading(value) {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}

export async function onRequestGet({ request, env }) {
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.HISTORY_DB) return json({ error: '単語登録の保存設定が完了していません。' }, 503);
  const { results } = await env.HISTORY_DB.prepare(
    'SELECT id, reading, replacement, created_at AS createdAt FROM user_dictionary WHERE user_sub = ? ORDER BY reading COLLATE NOCASE, rowid LIMIT ?'
  ).bind(auth.sub, ENTRY_LIMIT).all();
  return json({ entries: results || [], limit: ENTRY_LIMIT });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOriginPost(request)) return json({ error: '不正なリクエスト元です。' }, 403);
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.HISTORY_DB) return json({ error: '単語登録の保存設定が完了していません。' }, 503);
  if (!hasJsonContentType(request)) return json({ error: 'JSON形式で送信してください。' }, 415);
  const parsed = await readJsonLimited(request, 24000);
  if (parsed.tooLarge) return json({ error: 'リクエストが大きすぎます。' }, 413);
  if (!parsed.ok) return json({ error: '単語登録を読み取れませんでした。' }, 400);

  const { id, reading, replacement } = parsed.value || {};
  if (
    (id !== undefined && (typeof id !== 'string' || !id.trim() || id.length > 80)) ||
    typeof reading !== 'string' || !reading.trim() || reading.length > MAX_READING_LENGTH ||
    typeof replacement !== 'string' || !replacement.trim() || replacement.length > MAX_REPLACEMENT_LENGTH
  ) return json({ error: '読みと変換後の表記を入力してください（読み80文字、表記120文字まで）。' }, 400);

  const normalizedReading = normalizeReading(reading);
  const existing = id
    ? await env.HISTORY_DB.prepare('SELECT id FROM user_dictionary WHERE id = ? AND user_sub = ?').bind(id, auth.sub).first()
    : await env.HISTORY_DB.prepare('SELECT id FROM user_dictionary WHERE user_sub = ? AND normalized_reading = ?').bind(auth.sub, normalizedReading).first();
  if (id && !existing) return json({ error: '編集する登録語が見つかりません。' }, 404);
  if (!id && existing) return json({ error: '同じ読みがすでに登録されています。既存の登録を編集してください。' }, 409);
  if (!id) {
    const total = await env.HISTORY_DB.prepare(
      'SELECT COUNT(*) AS count FROM user_dictionary WHERE user_sub = ?'
    ).bind(auth.sub).first();
    if (Number(total?.count || 0) >= ENTRY_LIMIT) {
      return json({ error: `登録できるのは${ENTRY_LIMIT}語までです。不要な登録を削除してください。` }, 409);
    }
  }

  const entryId = id || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  try {
    if (id) {
      await env.HISTORY_DB.prepare(
        'UPDATE user_dictionary SET reading = ?, normalized_reading = ?, replacement = ?, created_at = ? WHERE id = ? AND user_sub = ?'
      ).bind(reading.trim(), normalizedReading, replacement.trim(), createdAt, entryId, auth.sub).run();
    } else {
      await env.HISTORY_DB.prepare(
        'INSERT INTO user_dictionary (id, user_email, user_sub, reading, normalized_reading, replacement, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(entryId, auth.email, auth.sub, reading.trim(), normalizedReading, replacement.trim(), createdAt).run();
    }
  } catch {
    return json({ error: '同じ読みが登録済みか、保存できませんでした。登録一覧を更新して確認してください。' }, 409);
  }
  return json({ entry: { id: entryId, reading: reading.trim(), replacement: replacement.trim(), createdAt } }, id ? 200 : 201);
}

export async function onRequestDelete({ request, env }) {
  if (!isSameOriginPost(request)) return json({ error: '不正なリクエスト元です。' }, 403);
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.HISTORY_DB) return json({ error: '単語登録の保存設定が完了していません。' }, 503);
  if (!hasJsonContentType(request)) return json({ error: 'JSON形式で送信してください。' }, 415);
  const parsed = await readJsonLimited(request, 24000);
  if (parsed.tooLarge) return json({ error: 'リクエストが大きすぎます。' }, 413);
  if (!parsed.ok) return json({ error: '削除対象を読み取れませんでした。' }, 400);
  const id = parsed.value?.id;
  if (typeof id !== 'string' || !id.trim() || id.length > 80) return json({ error: '削除する登録語を選択してください。' }, 400);
  const result = await env.HISTORY_DB.prepare(
    'DELETE FROM user_dictionary WHERE id = ? AND user_sub = ?'
  ).bind(id, auth.sub).run();
  if (!result.meta?.changes) return json({ error: '削除する登録語が見つかりません。' }, 404);
  return json({ deleted: true });
}
