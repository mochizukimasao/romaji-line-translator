export const API_LIMITS = {
  maxItems: 1000,
  maxIdLength: 200,
  maxItemLength: 4000,
  maxTotalLength: 120000
};

function invalid(error) {
  return { ok: false, status: 400, error };
}

export function validateTranslateRequest(body) {
  const mode = body?.mode === undefined ? 'romaji' : body.mode;
  if (mode !== 'romaji' && mode !== 'japanese') return invalid('変換モードが不正です。');
  if (!Array.isArray(body?.items) || !body.items.length || body.items.length > API_LIMITS.maxItems) {
    return invalid(`1〜${API_LIMITS.maxItems}項目の入力を送ってください。`);
  }

  const ids = new Set();
  let totalLength = 0;
  const items = [];
  for (const item of body.items) {
    if (!item || typeof item.id !== 'string' || typeof item.text !== 'string' || !item.id.trim() || !item.text.trim()) {
      return invalid('項目のidとtextには空でない文字列が必要です。');
    }
    if (item.id.length > API_LIMITS.maxIdLength) return invalid('項目のidが長すぎます。');
    if (item.text.length > API_LIMITS.maxItemLength) return invalid('1項目の入力が長すぎます。');
    if (ids.has(item.id)) return invalid('項目のidが重複しています。');
    ids.add(item.id);
    totalLength += item.text.length;
    items.push({ id: item.id, text: item.text });
  }
  if (totalLength > API_LIMITS.maxTotalLength) return invalid('入力が長すぎます。少し分けて変換してください。');
  return { ok: true, mode, items };
}
