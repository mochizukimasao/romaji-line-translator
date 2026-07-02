const sourceText = document.querySelector('#sourceText');
const results = document.querySelector('#results');
const lineCount = document.querySelector('#lineCount');
const convertedCount = document.querySelector('#convertedCount');
const totalChars = document.querySelector('#totalChars');
const globalStatus = document.querySelector('#globalStatus');
const message = document.querySelector('#message');
const convertAllButton = document.querySelector('#convertAll');
const copyButton = document.querySelector('#copyResult');
const clearButton = document.querySelector('#clearAll');

const translations = new Map();
const inFlight = new Map();
const failed = new Map();
let requestSerial = 0;

const sentenceBoundaries = new Set(['.', ',', '?', '!', '。', '、', '，', '？', '！']);

const statusLabels = {
  pending: '未確定',
  loading: '変換中',
  done: '完了',
  error: '失敗'
};

function isWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\r';
}

function getSourceLines() {
  if (!sourceText.value) return [];
  return sourceText.value.split('\n');
}

function splitLineIntoSegments(text) {
  const segments = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = cursor;
    let isConfirmed = false;

    while (end < text.length) {
      const char = text[end];
      if (sentenceBoundaries.has(char)) {
        isConfirmed = true;
        end += 1;
        while (end < text.length && sentenceBoundaries.has(text[end])) {
          end += 1;
        }
        break;
      }

      end += 1;
    }

    const segmentText = text.slice(cursor, end);
    if (segmentText.trim() || isConfirmed) {
      segments.push({
        index: segments.length,
        text: segmentText,
        isConfirmed
      });
    }

    if (end >= text.length) break;

    cursor = end;
    while (cursor < text.length && isWhitespace(text[cursor])) {
      cursor += 1;
    }
  }

  if (!segments.length && text.trim()) {
    segments.push({
      index: 0,
      text,
      isConfirmed: false
    });
  }

  return segments;
}

function getDisplayEntries() {
  return getSourceLines()
    .map((text, index) => ({
      index,
      text,
      segments: splitLineIntoSegments(text),
      isConfirmed: index < getSourceLines().length - 1
    }))
    .filter((entry) => entry.text.trim());
}

function resizeSourceText() {
  sourceText.style.height = 'auto';
  sourceText.style.height = `${Math.max(sourceText.scrollHeight, 540)}px`;
}

function setMessage(text = '', isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function segmentKey(lineIndex, segmentIndex, text) {
  return `${lineIndex}:${segmentIndex}:${text}`;
}

function splitTargets(targets, maxLines = 12, maxChars = 2800) {
  const chunks = [];
  let chunk = [];
  let charCount = 0;

  for (const item of targets) {
    const itemChars = item.text.length;
    if (chunk.length && (chunk.length >= maxLines || charCount + itemChars > maxChars)) {
      chunks.push(chunk);
      chunk = [];
      charCount = 0;
    }

    chunk.push(item);
    charCount += itemChars;
  }

  if (chunk.length) {
    chunks.push(chunk);
  }

  return chunks;
}

function getTotalChars(displayLines) {
  return displayLines.reduce((sum, line, index) => {
    return (
      sum +
      line.segments.reduce((lineSum, segment) => {
        const key = segmentKey(line.index, segment.index, segment.text);
        return lineSum + (translations.get(key)?.length || 0);
      }, 0)
    );
  }, 0);
}

function getLineStatus(line) {
  const keys = line.segments.map((segment) => segmentKey(line.index, segment.index, segment.text));
  if (keys.some((key) => inFlight.has(key))) return 'loading';
  if (keys.some((key) => failed.has(key))) return 'error';
  if (keys.length && keys.every((key) => translations.has(key))) return 'done';
  return line.isConfirmed ? 'pending' : 'pending';
}

function getLineText(line) {
  return line.segments
    .map((segment) => {
      const key = segmentKey(line.index, segment.index, segment.text);
      if (translations.has(key)) return translations.get(key) || '';
      return '...';
    })
    .join('');
}

function render() {
  const displayEntries = getDisplayEntries();
  const doneCount = displayEntries.filter((entry) => getLineStatus(entry) === 'done').length;
  const totalCharCount = getTotalChars(displayEntries);

  lineCount.textContent = `${displayEntries.length} 行`;
  convertedCount.textContent = `${doneCount} / ${displayEntries.length}`;
  totalChars.textContent = `${totalCharCount} 文字`;
  globalStatus.textContent = inFlight.size ? '変換中' : '待機中';
  convertAllButton.disabled = inFlight.size > 0;

  if (!displayEntries.length) {
    results.className = 'results empty';
    results.textContent = '改行で確定した行だけが表示されます。句読点は行内の区切りとして扱います。';
    return;
  }

  results.className = 'results';
  results.replaceChildren(
    ...displayEntries.map((entry) => {
      const row = document.createElement('div');
      row.className = 'result-row';

      const number = document.createElement('div');
      number.className = 'line-number';
      number.textContent = String(entry.index + 1).padStart(2, '0');

      const text = document.createElement('div');
      text.className = 'translated-text';
      text.textContent = getLineText(entry) || '...';

      const status = document.createElement('div');
      const statusValue = getLineStatus(entry);
      status.className = `row-status ${statusValue}`;
      status.textContent = statusLabels[statusValue];

      row.append(number, text, status);
      return row;
    })
  );

  resizeSourceText();
}

async function requestTranslation(lines) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || '変換に失敗しました。');
  }
  return data.translations;
}

async function translateTargets(targets, successMessage = '') {
  if (!targets.length) return;

  const serial = ++requestSerial;
  targets.forEach((item) => {
    failed.delete(item.key);
    inFlight.set(item.key, serial);
  });
  setMessage('');
  render();

  try {
    for (const chunk of splitTargets(targets)) {
      const translatedLines = await requestTranslation(chunk.map((item) => item.text));
      translatedLines.forEach((translated, index) => {
        const item = chunk[index];
        if (inFlight.get(item.key) === serial) {
          translations.set(item.key, translated || '');
          failed.delete(item.key);
        }
      });
    }
    if (successMessage) setMessage(successMessage);
  } catch (error) {
    targets.forEach((item) => {
      if (inFlight.get(item.key) === serial && !translations.has(item.key)) {
        failed.set(item.key, true);
      }
    });
    setMessage(error?.message || '変換に失敗しました。', true);
  } finally {
    targets.forEach((item) => {
      if (inFlight.get(item.key) === serial) inFlight.delete(item.key);
    });
    render();
  }
}

function translateConfirmedLines() {
  const entries = getDisplayEntries();
  const targets = [];

  for (const entry of entries) {
    for (const segment of entry.segments) {
      if (!segment.isConfirmed || !segment.text.trim()) continue;

      const key = segmentKey(entry.index, segment.index, segment.text);
      if (translations.has(key) || inFlight.has(key)) continue;

      targets.push({ text: segment.text, index: entry.index, key });
    }
  }

  void translateTargets(targets);
}

async function translateAllLines() {
  const targets = getDisplayEntries()
    .flatMap((entry) =>
      entry.segments.map((segment) => ({
        text: segment.text,
        index: entry.index,
        key: segmentKey(entry.index, segment.index, segment.text)
      }))
    )
    .filter((item) => item.text.trim());

  if (!targets.length) {
    setMessage('変換する行がありません。', true);
    return;
  }

  const serial = ++requestSerial;
  targets.forEach((item) => {
    failed.delete(item.key);
    inFlight.set(item.key, serial);
  });
  setMessage('');
  render();

  try {
    for (const chunk of splitTargets(targets)) {
      const translatedLines = await requestTranslation(chunk.map((item) => item.text));
      translatedLines.forEach((translated, index) => {
        const item = chunk[index];
        if (inFlight.get(item.key) === serial) {
          translations.set(item.key, translated || '');
          failed.delete(item.key);
        }
      });
    }
    setMessage('全体を変換しました。');
  } catch (error) {
    targets.forEach((item) => {
      if (inFlight.get(item.key) === serial && !translations.has(item.key)) {
        failed.set(item.key, true);
      }
    });
    setMessage(error?.message || '変換に失敗しました。', true);
  } finally {
    targets.forEach((item) => {
      if (inFlight.get(item.key) === serial) inFlight.delete(item.key);
    });
    render();
  }
}

async function copyResult() {
  const output = getDisplayEntries()
    .map((entry) =>
      entry.segments
        .map((segment) => translations.get(segmentKey(entry.index, segment.index, segment.text)) || '')
        .join('')
    )
    .join('\n')
    .trimEnd();

  if (!output.trim()) {
    setMessage('コピーできる変換結果がありません。', true);
    return;
  }

  await navigator.clipboard.writeText(output);
  setMessage('変換結果をコピーしました。');
}

function clearAll() {
  sourceText.value = '';
  translations.clear();
  inFlight.clear();
  failed.clear();
  requestSerial += 1;
  setMessage('入力をクリアしました。');
  resizeSourceText();
  render();
  sourceText.focus();
}

convertAllButton.addEventListener('click', () => {
  void translateAllLines();
});

copyButton.addEventListener('click', () => {
  void copyResult();
});

clearButton.addEventListener('click', () => {
  clearAll();
});

sourceText.addEventListener('input', () => {
  setMessage('');
  translateConfirmedLines();
  resizeSourceText();
  render();
});

window.addEventListener('resize', () => {
  resizeSourceText();
});

resizeSourceText();
render();
