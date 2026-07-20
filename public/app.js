import {
  buildDocument,
  canApplyResult,
  composeCopyText,
  getAllTranslatableItems,
  getDocumentStatus,
  getTranslatableItems,
  getTranslationMessage,
  isCurrentResponse,
  reconcileDocument
} from '/core.js';

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
const modeHint = document.querySelector('#modeHint');
const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
const heightButtons = Array.from(document.querySelectorAll('[data-height]'));
const DISPLAY_HEIGHT_STORAGE_KEY = 'romaji-line-translator.display-height';

const modeMeta = {
  romaji: { hint: '句読点・改行で確定', placeholder: 'otukaresamadesu.\nashita no yotei wo kakunin shitai?' },
  japanese: { hint: '改行で確定', placeholder: 'きょう は いい てんきだ\nでも すこし さむい' }
};
const statusLabels = { draft: '未確定', pending: '待機中', loading: '変換中', done: '完了', error: '失敗' };
let currentMode = 'romaji';
let requestVersion = 0;
let requestSerial = 0;
let documentModel = buildDocument('', currentMode, requestVersion);
let state = new Map();
let displayHeight = readDisplayHeight();

function readDisplayHeight() {
  try {
    return localStorage.getItem(DISPLAY_HEIGHT_STORAGE_KEY) === 'fixed' ? 'fixed' : 'auto';
  } catch {
    return 'auto';
  }
}

function setMessage(text = '', isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function getItem(item) {
  return state.get(item.id) || item;
}

function rebuildDocument() {
  requestVersion += 1;
  const reconciled = reconcileDocument(
    documentModel,
    state,
    sourceText.value,
    currentMode,
    requestVersion
  );
  documentModel = reconciled.document;
  state = reconciled.state;
}

function resizeSourceText() {
  if (displayHeight === 'fixed' && window.innerWidth > 720) {
    sourceText.style.height = '';
    return;
  }
  sourceText.style.height = 'auto';
  sourceText.style.height = `${Math.max(sourceText.scrollHeight, 180)}px`;
}

function setDisplayHeight(nextHeight, announce = false) {
  const wasFixed = displayHeight === 'fixed';
  displayHeight = nextHeight === 'fixed' ? 'fixed' : 'auto';
  document.body.classList.toggle('fixed-height', displayHeight === 'fixed');
  heightButtons.forEach((button) => {
    const selected = button.dataset.height === displayHeight;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  try {
    localStorage.setItem(DISPLAY_HEIGHT_STORAGE_KEY, displayHeight);
  } catch {
    // 表示設定を保存できない環境でも、現在の選択は反映する。
  }
  resizeSourceText();
  if (!wasFixed && displayHeight === 'fixed' && window.innerWidth > 720) {
    results.scrollTop = results.scrollHeight;
  }
  if (announce) setMessage(`${displayHeight === 'fixed' ? '固定' : '自動伸長'}表示に切り替えました。`);
}

function shouldFollowResults() {
  if (!document.body.classList.contains('fixed-height') || window.innerWidth <= 720) return false;
  const distanceFromBottom = results.scrollHeight - results.scrollTop - results.clientHeight;
  return distanceFromBottom <= 32;
}

function render() {
  const items = documentModel.flatMap((line) => line.segments);
  const done = items.filter((item) => getItem(item).status === 'done').length;
  const followResults = shouldFollowResults();
  const visibleLineCount = sourceText.value ? documentModel.length - (sourceText.value.endsWith('\n') ? 1 : 0) : 0;
  lineCount.textContent = `${visibleLineCount} 行`;
  convertedCount.textContent = `${done} / ${items.length}`;
  totalChars.textContent = `${items.reduce((sum, item) => sum + (getItem(item).output || '').length, 0)} 文字`;
  const status = getDocumentStatus(documentModel, getItem);
  globalStatus.textContent = { loading: '変換中', error: '一部失敗', draft: '未確定', done: '完了' }[status] || '待機中';
  modeHint.textContent = modeMeta[currentMode].hint;
  convertAllButton.disabled = status === 'loading';

  if (!documentModel.some((line) => line.segments.length)) {
    results.className = 'results empty';
    results.textContent = currentMode === 'japanese' ? '改行で確定した行から日本語整形結果が表示されます。' : '改行または句読点で確定した区切りから変換結果が表示されます。';
    return;
  }

  results.className = 'results';
  results.replaceChildren(...documentModel.map((line) => {
    const row = document.createElement('div');
    row.className = `result-row${line.segments.length ? '' : ' blank-row'}`;
    const number = document.createElement('div');
    number.className = 'line-number';
    number.textContent = String(line.lineIndex + 1).padStart(2, '0');
    const text = document.createElement('div');
    text.className = 'translated-text';
    text.textContent = line.segments.length ? line.segments.map((item) => getItem(item).output || '…').join('') : '';
    const status = document.createElement('div');
    const lineStatus = line.segments.length ? line.segments.map((item) => getItem(item).status) : ['done'];
    const statusValue = lineStatus.includes('error') ? 'error' : lineStatus.includes('loading') ? 'loading' : lineStatus.includes('draft') ? 'draft' : lineStatus.includes('pending') ? 'pending' : 'done';
    status.className = `row-status ${statusValue}`;
    status.textContent = line.segments.length ? statusLabels[statusValue] : '空行';
    row.append(number, text, status);
    for (const item of line.segments) {
      if (getItem(item).status === 'error') {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'retry-button';
        retry.textContent = '再試行';
        retry.addEventListener('click', () => void translateTargets([item]));
        row.append(retry);
        break;
      }
    }
    return row;
  }));
  resizeSourceText();
  if (followResults) results.scrollTop = results.scrollHeight;
}

async function requestTranslation(items, mode) {
  const response = await fetch('/api/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, items: items.map((item) => ({ id: item.id, text: item.source })) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '変換サービスを利用できません。');
  if (!Array.isArray(data.results)) throw new Error('変換結果を読み取れませんでした。');
  return data.results;
}

async function translateTargets(targets, successMessage = '') {
  const currentTargets = targets.map((item) => getItem(item));
  const unique = currentTargets.filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
  if (!unique.length) return;
  const serial = ++requestSerial;
  const mode = unique[0].mode;
  unique.forEach((item) => state.set(item.id, { ...item, status: 'loading', output: '', token: serial }));
  setMessage('');
  render();
  try {
    const responseResults = await requestTranslation(unique, mode);
    const byId = new Map(responseResults.map((result) => [result.id, result]));
    for (const item of unique) {
      const result = byId.get(item.id);
      const current = state.get(item.id);
      if (!isCurrentResponse(item, result, current, serial)) continue;
      if (result.status === 'error') {
        state.set(item.id, { ...item, status: 'error', output: '', errorCode: result.errorCode || 'service', token: serial });
      } else if (canApplyResult(item, result, current, serial)) {
        state.set(item.id, { ...item, status: 'done', output: result.output, errorCode: null, token: serial });
      }
    }
    for (const item of unique) {
      const current = state.get(item.id);
      if (
        current?.token === serial &&
        current.requestVersion === item.requestVersion &&
        current.status === 'loading'
      ) {
        state.set(item.id, { ...item, status: 'error', output: '', errorCode: 'missing_result', token: serial });
      }
    }
    const outcome = getTranslationMessage(documentModel, getItem, successMessage);
    setMessage(outcome.text, outcome.isError);
  } catch (error) {
    let appliedError = false;
    unique.forEach((item) => {
      const current = state.get(item.id);
      if (current?.token === serial && current.requestVersion === item.requestVersion) {
        state.set(item.id, { ...item, status: 'error', output: '', errorCode: 'service', token: serial });
        appliedError = true;
      }
    });
    if (appliedError) setMessage(error?.message || '変換サービスを利用できません。', true);
  }
  render();
}

function translateConfirmed() {
  void translateTargets(getTranslatableItems(documentModel, getItem));
}

function translateAll() {
  const targets = getAllTranslatableItems(documentModel, getItem);
  if (!targets.length) {
    const status = getDocumentStatus(documentModel, getItem);
    if (status === 'error') return setMessage('失敗項目の「再試行」を押してください。', true);
    return setMessage(status === 'done' ? 'すべて変換済みです。' : '変換する入力がありません。', status !== 'done');
  }
  void translateTargets(targets, '全体を変換しました。');
}

async function copyResult() {
  const copy = composeCopyText(documentModel, getItem);
  if (!copy.ready) return setMessage('未確定・処理中・失敗の項目があるためコピーできません。', true);
  try {
    await navigator.clipboard.writeText(copy.text);
    setMessage('変換結果をコピーしました。');
  } catch {
    setMessage('コピー権限がありません。', true);
  }
}

function clearAll() {
  sourceText.value = '';
  rebuildDocument();
  setMessage('入力をクリアしました。');
  resizeSourceText();
  render();
  sourceText.focus();
}

function setMode(nextMode) {
  if (nextMode === currentMode) return;
  currentMode = nextMode;
  rebuildDocument();
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === currentMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  sourceText.placeholder = modeMeta[currentMode].placeholder;
  setMessage(`${currentMode === 'japanese' ? '日本語整形' : 'ローマ字変換'}モードに切り替えました。`);
  render();
}

convertAllButton.addEventListener('click', translateAll);
copyButton.addEventListener('click', () => void copyResult());
clearButton.addEventListener('click', clearAll);
modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode === 'japanese' ? 'japanese' : 'romaji')));
heightButtons.forEach((button) => button.addEventListener('click', () => setDisplayHeight(button.dataset.height, true)));
sourceText.addEventListener('input', () => {
  rebuildDocument();
  setMessage('');
  render();
  translateConfirmed();
});

window.addEventListener('resize', resizeSourceText);
setDisplayHeight(displayHeight);
resizeSourceText();
render();
