const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

function createStyleGuardHint(attempt) {
  if (attempt === 0) {
    return '';
  }

  return [
    'Previous output contained polite Japanese.',
    'Rewrite every line in plain form only.',
    'Do not use です, ます, でした, ました, ません, でしょう, or polite request forms.',
    'Keep the meaning, but keep the wording as close and literal as possible.'
  ].join(' ');
}

function hasPoliteJapanese(text) {
  return /(?:です|ます|でした|ました|ません|でしょう|ください|ございます|いたします|なさいます)(?:[。！？!?…]|$)/.test(
    String(text ?? '').trim()
  );
}

export function buildTranslatePrompt(lines) {
  return [
    'You are a careful Japanese text converter.',
    'Convert each input line into concise, natural Japanese in plain form only.',
    'Never rewrite the result into です/ます style.',
    'The input is mostly romaji. Some Japanese may already be mixed in; preserve its meaning and keep the original tone.',
    'Prefer the most literal meaning that is still natural in Japanese.',
    'Preserve punctuation intent and line intent as much as possible.',
    'Do not add honorifics, explanatory phrasing, or extra softness.',
    'Return only a JSON array of translated strings in the same order. Do not add explanations.',
    '',
    'Input lines:',
    JSON.stringify(lines)
  ].join('\n');
}

async function requestTranslation(lines, { apiKey, model, attempt = 0 } = {}) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません。');
  }

  const response = await fetch(
    `${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${createStyleGuardHint(attempt)}\n${buildTranslatePrompt(lines)}`.trim() }] }],
        generationConfig: {
          temperature: 0,
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
  const translations = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.translations)
      ? parsed.translations
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];

  if (translations.length !== lines.length) {
    throw new Error('変換結果の行数が一致しませんでした。');
  }

  return translations.map((line) => String(line ?? '').trim());
}

export async function translateRomajiLines(lines, { apiKey, model = 'gemini-2.5-flash' } = {}) {
  const firstPass = await requestTranslation(lines, { apiKey, model, attempt: 0 });

  if (!firstPass.some(hasPoliteJapanese)) {
    return firstPass;
  }

  const secondPass = await requestTranslation(lines, { apiKey, model, attempt: 1 });

  if (secondPass.some(hasPoliteJapanese)) {
    throw new Error('丁寧語が混ざったため、平叙体への変換に失敗しました。');
  }

  return secondPass;
}
