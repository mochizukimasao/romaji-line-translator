const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

export function buildTranslatePrompt(lines) {
  return [
    'You are a careful Japanese text converter.',
    'Convert each input line into concise, natural Japanese.',
    'The input is mostly romaji. Some Japanese may already be mixed in; preserve its meaning and polish it naturally.',
    'Prefer the most natural conversational meaning when there are multiple interpretations.',
    'Preserve punctuation intent and line intent as much as possible.',
    'Return only JSON that matches the schema. Do not add explanations.',
    '',
    'Input lines:',
    JSON.stringify(lines)
  ].join('\n');
}

export async function translateRomajiLines(lines, { apiKey, model = 'gemini-2.5-flash' } = {}) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません。');
  }

  const response = await fetch(
    `${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildTranslatePrompt(lines) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || 'Gemini API request failed';
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(text);
  const translations = Array.isArray(parsed.translations) ? parsed.translations : [];

  if (translations.length !== lines.length) {
    throw new Error('変換結果の行数が一致しませんでした。');
  }

  return translations.map((line) => String(line ?? '').trim());
}
