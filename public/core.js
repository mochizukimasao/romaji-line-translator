export const SENTENCE_BOUNDARIES = new Set(['.', ',', '?', '!', '。', '、', '？', '！', '，']);
const PROTECTED_SPAN_PATTERNS = [
  /https?:\/\/\S+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /[@#][A-Za-z0-9_][A-Za-z0-9_.-]*/g,
  /\d+(?:[.,:/-]\d+)+/g
];
const TRAILING_SENTENCE_PUNCTUATION = /[.,?!。、「」『』（）［］【】、，？！]+$/u;

function isWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\r';
}

export function getProtectedSpans(source) {
  const text = String(source ?? '');
  const spans = [];
  for (const pattern of PROTECTED_SPAN_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      let token = match[0];
      if (token.startsWith('http://') || token.startsWith('https://')) {
        token = token.replace(TRAILING_SENTENCE_PUNCTUATION, '');
      }
      if (token) spans.push({ start: match.index, end: match.index + token.length });
    }
  }
  return spans;
}

export function hashSource(source) {
  let hash = 2166136261;
  for (const char of String(source ?? '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createItemId(mode, lineIndex, segmentIndex, source) {
  const text = String(source ?? '');
  return `${mode}:${lineIndex}:${segmentIndex}:${hashSource(text)}-${text.length.toString(36)}`;
}

export function splitLineIntoSegments(text, mode, isLastLine = true) {
  const source = String(text ?? '');
  if (!source.trim()) return [];

  if (mode === 'japanese') {
    return [{ index: 0, text: source, confirmed: !isLastLine }];
  }

  const protectedSpans = getProtectedSpans(source);
  const isProtected = (index) => protectedSpans.some((span) => index >= span.start && index < span.end);
  const segments = [];
  let cursor = 0;
  while (cursor < source.length) {
    let end = cursor;
    let confirmed = false;
    while (end < source.length) {
      if (SENTENCE_BOUNDARIES.has(source[end]) && !isProtected(end)) {
        confirmed = true;
        end += 1;
        while (end < source.length && SENTENCE_BOUNDARIES.has(source[end]) && !isProtected(end)) end += 1;
        break;
      }
      end += 1;
    }

    const segmentText = source.slice(cursor, end);
    if (segmentText.trim()) segments.push({ index: segments.length, text: segmentText, confirmed });
    if (end >= source.length) break;
    cursor = end;
    while (cursor < source.length && isWhitespace(source[cursor])) cursor += 1;
  }

  const lastSegment = segments.at(-1);
  if (lastSegment && !lastSegment.confirmed && !isLastLine) lastSegment.confirmed = true;
  return segments;
}

export function buildDocument(text, mode = 'romaji', requestVersion = 1) {
  const lines = String(text ?? '').split('\n');
  return lines.map((source, lineIndex) => ({
    lineIndex,
    source,
    segments: splitLineIntoSegments(source, mode, lineIndex === lines.length - 1).map((segment) => ({
      ...segment,
      id: createItemId(mode, lineIndex, segment.index, segment.text),
      mode,
      lineIndex,
      segmentIndex: segment.index,
      source: segment.text,
      status: segment.confirmed ? 'pending' : 'draft',
      output: '',
      requestVersion
    }))
  }));
}

function sameItem(previous, next) {
  return Boolean(
    previous &&
    previous.id === next.id &&
    previous.mode === next.mode &&
    previous.lineIndex === next.lineIndex &&
    previous.segmentIndex === next.segmentIndex &&
    previous.source === next.source
  );
}

export function reconcileDocument(previousDocument, previousState, text, mode, nextRequestVersion) {
  const previousItems = new Map(
    (previousDocument || []).flatMap((line) => line.segments).map((item) => [item.id, item])
  );
  const document = buildDocument(text, mode, nextRequestVersion);
  const state = new Map();

  for (const line of document) {
    line.segments = line.segments.map((item) => {
      const previousItem = previousItems.get(item.id);
      const previousCurrent = previousState?.get(item.id) || previousItem;
      const canPreserve = sameItem(previousItem, item) &&
        previousCurrent &&
        previousCurrent.confirmed === item.confirmed;
      const current = canPreserve
        ? {
            ...item,
            ...previousCurrent,
            id: item.id,
            mode: item.mode,
            lineIndex: item.lineIndex,
            segmentIndex: item.segmentIndex,
            source: item.source,
            confirmed: item.confirmed,
            requestVersion: previousCurrent.requestVersion
          }
        : item;
      state.set(current.id, current);
      return current;
    });
  }

  return { document, state };
}

export function getTranslatableItems(document, getItem = (item) => item) {
  return document
    .flatMap((line) => line.segments)
    .map((item) => getItem(item) || item)
    .filter((item) => item.confirmed && item.source.trim() && item.status === 'pending');
}

export function getAllTranslatableItems(document, getItem = (item) => item) {
  return document
    .flatMap((line) => line.segments)
    .map((item) => getItem(item) || item)
    .filter((item) => item.source.trim() && (item.status === 'draft' || item.status === 'pending'));
}

export function isCurrentResponse(sentItem, result, currentItem, token) {
  return Boolean(
    sentItem &&
    result &&
    currentItem &&
    sentItem.id === result.id &&
    sentItem.id === currentItem.id &&
    sentItem.requestVersion === currentItem.requestVersion &&
    currentItem.token === token
  );
}

export function canApplyResult(sentItem, result, currentItem, token) {
  return isCurrentResponse(sentItem, result, currentItem, token) && result.status === 'ok';
}

export function composeCopyText(document, getItem) {
  let incomplete = false;
  const lines = document.map((line) => {
    return line.segments.map((item) => {
      const current = getItem(item) || item;
      if (current.status !== 'done' || typeof current.output !== 'string') incomplete = true;
      return current.output || '';
    }).join('');
  });
  return { ready: !incomplete && document.some((line) => line.segments.length > 0), text: lines.join('\n') };
}

export function getDocumentStatus(document, getItem) {
  const items = document.flatMap((line) => line.segments);
  if (items.some((item) => (getItem(item) || item).status === 'loading')) return 'loading';
  if (items.some((item) => (getItem(item) || item).status === 'error')) return 'error';
  if (items.some((item) => (getItem(item) || item).status === 'draft')) return 'draft';
  if (items.length && items.every((item) => (getItem(item) || item).status === 'done')) return 'done';
  return 'idle';
}

export function getTranslationMessage(document, getItem, successMessage = '') {
  const statuses = document.flatMap((line) => line.segments).map((item) => (getItem(item) || item).status);
  if (statuses.includes('error')) {
    return {
      text: '一部の項目の変換に失敗しました。失敗項目を再試行してください。',
      isError: true
    };
  }
  if (successMessage && statuses.length && statuses.every((status) => status === 'done')) {
    return { text: successMessage, isError: false };
  }
  return { text: '', isError: false };
}
