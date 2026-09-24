import { DEFAULT_GEMINI_MODEL, translateItems } from '../../src/lib/gemini.js';
import { validateTranslateRequest } from '../../src/lib/api-request.js';
import { getAuthorizedIdentity, isSameOriginPost } from '../lib/google-auth.js';
import { hasJsonContentType, readJsonLimited } from '../lib/read-json-limited.js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isSameOriginPost(request)) return json({ error: '不正なリクエスト元です。' }, 403);
  const auth = await getAuthorizedIdentity(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!hasJsonContentType(request)) return json({ error: 'JSON形式で送信してください。' }, 415);
  const parsed = await readJsonLimited(request);
  if (parsed.tooLarge) return json({ error: 'リクエストが大きすぎます。' }, 413);
  if (!parsed.ok) return json({ error: 'JSONを読み取れませんでした。' }, 400);
  const body = parsed.value;
  const validation = validateTranslateRequest(body);
  if (!validation.ok) return json({ error: validation.error }, validation.status);
  if (!env.GEMINI_API_KEY) return json({ error: '変換サービスの設定がありません。' }, 500);
  try {
    const dictionary = validation.mode === 'romaji' && env.HISTORY_DB
      ? (await env.HISTORY_DB.prepare(
        'SELECT reading, replacement FROM user_dictionary WHERE user_sub = ? ORDER BY reading COLLATE NOCASE LIMIT 100'
      ).bind(auth.sub).all()).results || []
      : [];
    const results = await translateItems(validation.items, {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      mode: validation.mode,
      dictionary
    });
    return json({ results });
  } catch {
    return json({ error: '変換サービスを利用できません。' }, 503);
  }
}
