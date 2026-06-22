import { translateRomajiLines } from '../../src/lib/gemini.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json().catch(() => ({}));
    const lines = Array.isArray(body?.lines) ? body.lines : [];

    if (!lines.length || lines.length > 80) {
      return Response.json({ error: '1〜80行の入力を送ってください。' }, { status: 400 });
    }

    const normalizedLines = lines.map((line) => String(line ?? '').slice(0, 500));
    const totalLength = normalizedLines.join('\n').length;
    if (totalLength > 12000) {
      return Response.json({ error: '入力が長すぎます。少し分けて変換してください。' }, { status: 400 });
    }

    const translations = await translateRomajiLines(normalizedLines, {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-2.5-flash'
    });

    return Response.json({ translations });
  } catch (error) {
    console.error(error);
    const detail = error?.message ? ` (${error.message})` : '';
    return Response.json({ error: `Gemini での変換に失敗しました${detail}` }, { status: 500 });
  }
}
