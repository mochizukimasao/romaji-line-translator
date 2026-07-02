const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

function buildTranslatePrompt(lines) {
  return [
    'You are a Japanese text normalization editor.',
    'Goal: convert romaji and broken input into natural, readable Japanese while preserving meaning and order.',
    'Do not summarize, paraphrase, explain, or add commentary.',
    'Keep existing meaning, tone, and wording as much as possible.',
    'Convert romaji into natural Japanese kanji/kana based on context.',
    'Normalize punctuation for Japanese text.',
    'Convert ASCII punctuation such as comma and period into Japanese punctuation when appropriate, especially to "、" and "。".',
    'Add punctuation where needed so long sentences read naturally.',
    'Preserve existing Japanese characters, symbols, numbers, and line order unless a minimal correction is needed.',
    'If a line contains multiple clauses or sentences, keep them in the same line and finish the entire line.',
    'Do not stop early. Return a translation for every input line in the same order.',
    'Return only a JSON array of translated strings.',
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
