const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

function buildTranslatePrompt(lines) {
  return [
    'You convert Japanese text strictly by orthography rules.',
    'Hard requirement: convert romaji to natural Japanese.',
    'Do not translate, paraphrase, summarize, or change tone.',
    'Do not change existing kanji, hiragana, katakana, punctuation, spaces, or line breaks.',
    'Convert Latin-script romaji sequences into natural Japanese, using kanji, hiragana, and katakana as appropriate.',
    'Return only a JSON array of translated strings in the same order. Do not add explanations.',
    '',
    'Input lines:',
    JSON.stringify(lines)
  ].join('\n');
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

function isSubsequence(needle, haystack) {
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) {
      cursor += 1;
      if (cursor === needle.length) return true;
    }
  }
  return needle.length === 0;
}

function validateConversion(input, output) {
  const inputText = safeString(input);
  const outputText = safeString(output);
  if (!outputText) return false;

  const inputNonRomaji = inputText.replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, '');
  const outputNonRomaji = outputText.replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, '');

  return isSubsequence(inputNonRomaji, outputNonRomaji);
}

function splitLines(lines, maxLines = 12, maxChars = 2800) {
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

async function requestTranslation(lines, { apiKey, model, attempt = 0 } = {}) {
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
            parts: [{ text: `${guard}\n${buildTranslatePrompt(lines)}`.trim() }]
          }
        ],
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

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const translations = parseResponse(text);

  if (translations.length !== lines.length) {
    throw new Error('変換結果の行数が一致しませんでした。');
  }

  const normalized = translations.map((line) => safeString(line).trimEnd());
  if (!normalized.every((line, index) => validateConversion(lines[index], line))) {
    throw new Error('ローマ字以外の文字が書き換えられました。');
  }

  return normalized;
}

export async function translateRomajiLines(lines, { apiKey, model = 'gemini-2.5-flash' } = {}) {
  const normalizedLines = lines.map((line) => safeString(line));
  const translated = [];

  for (const chunk of splitLines(normalizedLines)) {
    try {
      const result = await requestTranslation(chunk, { apiKey, model, attempt: 0 });
      translated.push(...result);
    } catch (error) {
      const message = error?.message || 'unknown error';
      console.warn('[romaji-line-translator] first translation attempt failed, retrying once:', message);
      const retry = await requestTranslation(chunk, { apiKey, model, attempt: 1 });
      translated.push(...retry);
    }
  }

  return translated;
}
