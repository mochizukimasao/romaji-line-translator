const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

function buildRomajiPrompt(lines) {
  return [
    'You are a Japanese romaji-to-kana normalization editor.',
    'Goal: convert romaji into natural, readable Japanese while preserving meaning and order.',
    'Do not summarize, paraphrase, explain, or add commentary.',
    'Keep existing meaning, tone, and wording as much as possible.',
    'Convert romaji into natural Japanese kanji/kana based on context.',
    'Normalize punctuation for Japanese text.',
    'Convert ASCII punctuation such as comma and period into Japanese punctuation when appropriate, especially to "、" and "。".',
    'Treat punctuation and line breaks as boundaries between input segments, but finish each segment naturally and completely.',
    'Preserve existing Japanese characters, symbols, numbers, and line order unless a minimal correction is needed.',
    'If a segment contains multiple clauses or sentences, keep them in the same segment and finish the entire segment.',
    'Do not stop early. Return a translation for every input segment in the same order.',
    'Return only a JSON array of translated strings.',
    '',
    'Input segments:',
    JSON.stringify(lines)
  ].join('\n');
}

function buildJapanesePrompt(lines) {
  return [
    'You are a Japanese text normalization editor.',
    'Goal: polish rough Japanese notes, speech-to-text output, and shorthand into natural, readable Japanese while preserving meaning and order.',
    'Do not summarize, paraphrase, explain, or add commentary.',
    'Keep the original meaning, facts, and tone as close as possible.',
    'Repair obvious omissions, broken phrasing, particles, kanji/kana balance, and punctuation.',
    'Prefer standard, clean Japanese over slangy or overly literary rewrites.',
    'Do not change the content into a different style or add new information.',
    'Preserve existing symbols, numbers, names, and line order unless a minimal correction is needed.',
    'Treat each input line as one unit and keep the result in the same order.',
    'Do not stop early. Return a normalization for every input line in the same order.',
    'Return only a JSON array of translated strings.',
    '',
    'Input lines:',
    JSON.stringify(lines)
  ].join('\n');
}

function buildTranslatePrompt(mode, lines) {
  return mode === 'japanese' ? buildJapanesePrompt(lines) : buildRomajiPrompt(lines);
}

function parseResponse(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.translations)) return parsed.translations;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [];
}

function safeString(value) {
  return String(value ?? '');
}

function validateRomajiConversion(output) {
  const outputText = safeString(output);
  if (!outputText) return false;
  if (/[A-Za-z]/.test(outputText)) return false;
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}0-9。、！？「」『』（）［］【】・…—ー]/u.test(outputText)) {
    return false;
  }
  return outputText.trim().length > 0;
}

function validateJapaneseConversion(output) {
  const outputText = safeString(output);
  return outputText.trim().length > 0;
}

function splitLines(lines, maxLines = 8, maxChars = 1800) {
  const chunks = [];
  let chunk = [];
  let charCount = 0;

  for (const line of lines) {
    const text = safeString(line);
    const lineChars = text.length;
    if (chunk.length && (chunk.length >= maxLines || charCount + lineChars > maxChars)) {
      chunks.push(chunk);
      chunk = [];
      charCount = 0;
    }

    chunk.push(text);
    charCount += lineChars;
  }

  if (chunk.length) {
    chunks.push(chunk);
  }

  return chunks;
}

async function requestTranslation(lines, { apiKey, model, mode = 'romaji', attempt = 0 } = {}) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません。');
  }

  const guard = attempt
    ? [
        'Previous output violated the hard requirement.',
        'Do not rewrite Japanese that is already present.',
        'Only convert romaji to kana, nothing else.'
      ].join(' ')
    : '';

  const response = await fetch(
    `${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${guard}\n${buildTranslatePrompt(mode, lines)}`.trim() }]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
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

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const translations = parseResponse(text);

  if (translations.length !== lines.length) {
    throw new Error('変換結果の行数が一致しませんでした。');
  }

  const normalized = translations.map((line) => safeString(line).trimEnd());
  const isValid = mode === 'japanese'
    ? normalized.every((line) => validateJapaneseConversion(line))
    : normalized.every((line) => validateRomajiConversion(line));

  if (!isValid) {
    throw new Error(mode === 'japanese'
      ? '日本語整形の結果が不正でした。'
      : 'ローマ字変換の結果が不正でした。');
  }

  return normalized;
}

export async function translateRomajiLines(lines, { apiKey, model = 'gemini-2.5-flash' } = {}) {
  return translateTextLines(lines, { apiKey, model, mode: 'romaji' });
}

export async function translateTextLines(lines, { apiKey, model = 'gemini-2.5-flash', mode = 'romaji' } = {}) {
  const normalizedLines = lines.map((line) => safeString(line));
  const translated = [];

  for (const chunk of splitLines(normalizedLines)) {
    try {
      const result = await requestTranslation(chunk, { apiKey, model, mode, attempt: 0 });
      translated.push(...result);
    } catch (error) {
      const message = error?.message || 'unknown error';
      console.warn('[romaji-line-translator] first translation attempt failed, retrying once:', message);
      const retry = await requestTranslation(chunk, { apiKey, model, mode, attempt: 1 });
      translated.push(...retry);
    }
  }

  return translated;
}
