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

const statusLabels = {
  pending: '未確定',
  loading: '変換中',
  done: '完了',
  error: '失敗'
};

function getAllLines() {
  return sourceText.value.split('\n');
}

function getConfirmedLineCount() {
  const lines = getAllLines();
  return Math.max(lines.length - 1, 0);
}

function resizeSourceText() {
  sourceText.style.height = 'auto';
  sourceText.style.height = `${Math.max(sourceText.scrollHeight, 540)}px`;
}

function setMessage(text = '', isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function lineKey(index, text) {
  return `${index}:${text}`;
}

function getTotalChars(displayLines) {
  return displayLines.reduce((sum, line, index) => {
    const key = lineKey(index, line);
    return sum + (translations.get(key)?.length || 0);
  }, 0);
}

function getEntry(index, text, isConfirmed) {
  const key = lineKey(index, text);
  if (inFlight.has(key)) return { status: 'loading', text: translations.get(key) || '' };
  if (translations.has(key)) return { status: 'done', text: translations.get(key) };
  if (failed.has(key)) return { status: 'error', text: '変換に失敗しました' };
  return { status: isConfirmed ? 'pending' : 'pending', text: '' };
}

function render() {
  const lines = getAllLines();
  const confirmedCount = getConfirmedLineCount();
  const displayLines = lines.filter((line, index) => index < confirmedCount || line.trim());
  const doneCount = displayLines.filter((line, index) => translations.has(lineKey(index, line))).length;
  const totalCharCount = getTotalChars(displayLines);

  lineCount.textContent = `${lines.filter((line) => line.trim()).length} 行`;
  convertedCount.textContent = `${doneCount} / ${displayLines.length}`;
  totalChars.textContent = `${totalCharCount} 文字`;
  globalStatus.textContent = inFlight.size ? '変換中' : '待機中';
  convertAllButton.disabled = inFlight.size > 0;

  if (!displayLines.length) {
    results.className = 'results empty';
    results.textContent = '改行で確定した行から変換結果が表示されます。';
    return;
  }

  results.className = 'results';
  results.replaceChildren(
    ...displayLines.map((line, index) => {
      const isConfirmed = index < confirmedCount;
      const entry = getEntry(index, line, isConfirmed);
      const row = document.createElement('div');
      row.className = 'result-row';

      const number = document.createElement('div');
      number.className = 'line-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const text = document.createElement('div');
      text.className = 'translated-text';
      text.textContent = entry.text || (isConfirmed ? '...' : '改行で確定');

      const status = document.createElement('div');
      status.className = `row-status ${entry.status}`;
      status.textContent = isConfirmed ? statusLabels[entry.status] : '未確定';

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

async function translateLine(index, text) {
  if (!text.trim()) return;

  const key = lineKey(index, text);
  if (translations.has(key) || inFlight.has(key)) return;

  const serial = ++requestSerial;
  inFlight.set(key, serial);
  failed.delete(key);
  setMessage('');
  render();

  try {
    const [translated] = await requestTranslation([text]);
    if (inFlight.get(key) === serial) {
      translations.set(key, translated || '');
    }
  } catch (error) {
    setMessage('');
  } finally {
    if (inFlight.get(key) === serial) {
      inFlight.delete(key);
    }
    render();
  }
}

function translateConfirmedLines() {
  const lines = getAllLines();
  const confirmedCount = getConfirmedLineCount();
  for (let index = 0; index < confirmedCount; index += 1) {
    translateLine(index, lines[index]);
  }
}

async function translateAllLines() {
  const lines = getAllLines().filter((line, index, all) => line.trim() || index < all.length - 1);
  const targets = lines
    .map((text, index) => ({ text, index, key: lineKey(index, text) }))
    .filter((item) => item.text.trim());

  if (!targets.length) {
    setMessage('変換する行がありません。', true);
    return;
  }

  const serial = ++requestSerial;
  targets.forEach((item) => {
    inFlight.set(item.key, serial);
    failed.delete(item.key);
  });
  setMessage('');
  render();

  try {
    const translatedLines = await requestTranslation(targets.map((item) => item.text));
    translatedLines.forEach((translated, index) => {
      translations.set(targets[index].key, translated || '');
    });
    setMessage('全体を変換しました。');
  } catch (error) {
    setMessage('');
  } finally {
    targets.forEach((item) => {
      if (inFlight.get(item.key) === serial) inFlight.delete(item.key);
    });
    render();
  }
}

async function copyResult() {
  const lines = getAllLines();
  const output = lines
    .map((line, index) => translations.get(lineKey(index, line)) || '')
    .join('\n')
    .trimEnd();

  if (!output.trim()) {
    setMessage('コピーできる変換結果がありません。', true);
    return;
  }

  await navigator.clipboard.writeText(output);
  setMessage('変換結果をコピーしました。');
}

sourceText.addEventListener('input', () => {
  setMessage('');
  translateConfirmedLines();
  resizeSourceText();
  render();
});

window.addEventListener('resize', () => {
  resizeSourceText();
});

convertAllButton.addEventListener('click', translateAllLines);
copyButton.addEventListener('click', copyResult);
clearButton.addEventListener('click', () => {
  sourceText.value = '';
  translations.clear();
  inFlight.clear();
  failed.clear();
  setMessage('');
  resizeSourceText();
  render();
  sourceText.focus();
});

resizeSourceText();
render();
