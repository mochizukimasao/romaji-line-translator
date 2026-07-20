import { translateItems } from '../../src/lib/gemini.js';
import { validateTranslateRequest } from '../../src/lib/api-request.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const validation = validateTranslateRequest(body);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: validation.status });
  if (!env.GEMINI_API_KEY) return Response.json({ error: '変換サービスの設定がありません。' }, { status: 500 });
  try {
    const results = await translateItems(validation.items, {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-3.5-flash',
      mode: validation.mode
    });
    return Response.json({ results });
  } catch {
    return Response.json({ error: '変換サービスを利用できません。' }, { status: 503 });
  }
}
