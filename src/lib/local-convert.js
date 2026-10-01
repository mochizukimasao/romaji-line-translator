const ROMAJI = new Map([
  ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'], ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'], ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
  ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'], ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
  ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'], ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'],
  ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'], ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
  ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'], ['shi', 'し'], ['chi', 'ち'], ['tsu', 'つ'], ['fu', 'ふ'],
  ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'], ['sa', 'さ'], ['si', 'し'], ['shi', 'し'],
  ['su', 'す'], ['se', 'せ'], ['so', 'そ'], ['ta', 'た'], ['ti', 'ち'], ['chi', 'ち'], ['tu', 'つ'], ['tsu', 'つ'], ['te', 'て'], ['to', 'と'],
  ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'], ['ha', 'は'], ['hi', 'ひ'], ['hu', 'ふ'], ['fu', 'ふ'], ['he', 'へ'], ['ho', 'ほ'],
  ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'], ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
  ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'], ['wa', 'わ'], ['wi', 'うぃ'], ['we', 'うぇ'], ['wo', 'を'],
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'], ['za', 'ざ'], ['zi', 'じ'], ['ji', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['da', 'だ'], ['di', 'ぢ'], ['du', 'づ'], ['de', 'で'], ['do', 'ど'], ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'], ['fa', 'ふぁ'], ['fi', 'ふぃ'], ['fe', 'ふぇ'], ['fo', 'ふぉ'],
  ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
  ['kye', 'きぇ'], ['she', 'しぇ'], ['che', 'ちぇ'], ['je', 'じぇ'], ['nye', 'にぇ'], ['hye', 'ひぇ'], ['mye', 'みぇ'], ['rye', 'りぇ'],
  ['lya', 'ゃ'], ['lyu', 'ゅ'], ['lyo', 'ょ'], ['lka', 'ヵ'], ['lke', 'ヶ'], ['ltsu', 'っ'], ['la', 'ぁ'], ['li', 'ぃ'], ['lu', 'ぅ'], ['le', 'ぇ'], ['lo', 'ぉ'],
  ['xya', 'ゃ'], ['xyu', 'ゅ'], ['xyo', 'ょ'], ['xtsu', 'っ'], ['xa', 'ぁ'], ['xi', 'ぃ'], ['xu', 'ぅ'], ['xe', 'ぇ'], ['xo', 'ぉ']
]);
const PROTECTED = /https?:\/\/[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[@#][A-Za-z0-9_][A-Za-z0-9_.-]*|\d+(?:[.,:/-]\d+)*/giu;
const ASCII_PUNCTUATION = { ',': '、', '?': '？', '!': '！' };

function transliterateToken(token) {
  const source = token.toLowerCase();
  let result = '';
  for (let i = 0; i < source.length;) {
    const current = source[i];
    if (/[bcdfghjklmpqrstvwxyz]/u.test(current) && source[i + 1] === current && current !== 'n') {
      result += 'っ';
      i += 1;
      continue;
    }
    if (current === 'n' && (i === source.length - 1 || source[i + 1] === "'" || !/[aiueoyn]/u.test(source[i + 1]))) {
      result += 'ん';
      i += source[i + 1] === "'" ? 2 : 1;
      continue;
    }
    let match = '';
    for (const length of [4, 3, 2, 1]) {
      const candidate = source.slice(i, i + length);
      if (ROMAJI.has(candidate)) { match = candidate; break; }
    }
    if (match) {
      result += ROMAJI.get(match);
      i += match.length;
    } else {
      result += token[i];
      i += 1;
    }
  }
  return result;
}

function applyDictionary(source, dictionary) {
  return [...dictionary]
    .filter((entry) => typeof entry?.reading === 'string' && entry.reading.trim() && typeof entry?.replacement === 'string')
    .sort((a, b) => b.reading.length - a.reading.length)
    .reduce((text, entry) => {
      const reading = entry.reading.trim().split(/\s+/u).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      return text.replace(new RegExp(`(^|[^A-Za-z])(${reading})(?=$|[^A-Za-z])`, 'giu'), (_match, before) => `${before}${entry.replacement}`);
    }, source);
}

export function convertRomajiLocally(source, dictionary = []) {
  const prepared = applyDictionary(String(source ?? ''), dictionary);
  let result = '';
  let lastIndex = 0;
  for (const match of prepared.matchAll(PROTECTED)) {
    result += transliterateToken(prepared.slice(lastIndex, match.index));
    result += match[0];
    lastIndex = match.index + match[0].length;
  }
  result += transliterateToken(prepared.slice(lastIndex));
  return result.replace(/[?!,]/gu, (mark) => ASCII_PUNCTUATION[mark]);
}

export function formatJapaneseLocally(source) {
  return String(source ?? '').trim()
    .replace(/\s+/gu, ' ')
    .replace(/([\u3040-\u30ff\u3400-\u9fff\uF900-\uFAFF]) ([\u3040-\u30ff\u3400-\u9fff\uF900-\uFAFF])/gu, '$1$2')
    .replace(/([?!,])(?=\s|$)/gu, (mark) => ASCII_PUNCTUATION[mark]);
}
