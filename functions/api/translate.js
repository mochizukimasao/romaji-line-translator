import { validateTranslateRequest } from '../../src/lib/api-request.js';
import { convertRomajiLocally, formatJapaneseLocally } from '../../src/lib/local-convert.js';
import { translateWithWorkersAI } from '../../src/lib/workers-ai.js';
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
  try {
    let dictionary = [];
    if (validation.mode === 'romaji' && env.HISTORY_DB) {
      try {
        dictionary = (await env.HISTORY_DB.prepare(
          'SELECT reading, replacement FROM user_dictionary WHERE user_sub = ? ORDER BY reading COLLATE NOCASE LIMIT 100'
        ).bind(auth.sub).all()).results || [];
      } catch (error) {
        console.warn('Dictionary lookup failed; continuing without user words', {
          name: String(error?.name || 'Error'),
          status: Number(error?.status ?? error?.statusCode ?? 0) || null
        });
      }
    }
    let results = env.AI
      ? await translateWithWorkersAI(env.AI, validation.items, { mode: validation.mode, dictionary })
      : validation.items.map((item) => ({
        id: item.id,
        status: 'ok',
        output: validation.mode === 'romaji'
          ? convertRomajiLocally(item.text, dictionary)
          : formatJapaneseLocally(item.text),
        errorCode: null
      }));
    const usedLocalFallback = Boolean(env.AI && results.some((result) => result.status === 'error'));
    if (usedLocalFallback) {
      const sourceById = new Map(validation.items.map((item) => [item.id, item.text]));
      results = results.map((result) => result.status === 'error'
        ? {
            id: result.id,
            status: 'ok',
            output: validation.mode === 'romaji'
              ? convertRomajiLocally(sourceById.get(result.id), dictionary)
              : formatJapaneseLocally(sourceById.get(result.id)),
            errorCode: null,
            localFallback: true
          }
        : result);
    }
    return json({ results, usedLocalFallback });
  } catch {
    return json({ error: '変換サービスを利用できません。' }, 503);
  }
}
