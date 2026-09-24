import {
  buildDocument,
  canApplyResult,
  composeCopyText,
  getAllTranslatableItems,
  getDocumentStatus,
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
const historyList = document.querySelector('#historyList');
const refreshHistoryButton = document.querySelector('#refreshHistory');
const dictionaryPanel = document.querySelector('#dictionaryPanel');
const dictionaryDetails = document.querySelector('#dictionaryDetails');
const dictionaryCount = document.querySelector('#dictionaryCount');
const dictionaryForm = document.querySelector('#dictionaryForm');
const dictionaryReading = document.querySelector('#dictionaryReading');
const dictionaryReplacement = document.querySelector('#dictionaryReplacement');
const dictionarySubmit = document.querySelector('#dictionarySubmit');
const dictionaryCancel = document.querySelector('#dictionaryCancel');
const dictionaryMessage = document.querySelector('#dictionaryMessage');
const dictionaryList = document.querySelector('#dictionaryList');
const authGate = document.querySelector('#authGate');
const authMessage = document.querySelector('#authMessage');
const googleSignIn = document.querySelector('#googleSignIn');
const authControls = document.querySelector('#authControls');
const authAccount = document.querySelector('#authAccount');
const logoutButton = document.querySelector('#logoutButton');
const translatorTools = document.querySelector('#translatorTools');
const workspace = document.querySelector('#workspace');
const historyPanel = document.querySelector('#historyPanel');
const DISPLAY_HEIGHT_STORAGE_KEY = 'romaji-line-translator.display-height';
const modeMeta = {
  romaji: { hint: '文の区切り: 句読点・改行', placeholder: 'otukaresamadesu.\nashita no yotei wo kakunin shitai?' },
  japanese: { hint: '文の区切り: 改行', placeholder: 'きょう は いい てんきだ\nでも すこし さむい' }
};
const statusLabels = { draft: '未確定', pending: '待機中', loading: '変換中', done: '完了', error: '失敗' };
let currentMode = 'romaji';
let requestVersion = 0;
let requestSerial = 0;
let documentModel = buildDocument('', currentMode, requestVersion);
let state = new Map();
let displayHeight = readDisplayHeight();
let historyRecords = [];
let dictionaryEntries = [];
let dictionaryEditingId = null;
let authenticatedUser = null;
let googleSignInInitialized = false;

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

function setAuthenticatedUser(user) {
  authenticatedUser = user || null;
  const authenticated = Boolean(authenticatedUser);
  authGate.hidden = authenticated;
  workspace.hidden = !authenticated;
  historyPanel.hidden = !authenticated;
  dictionaryPanel.hidden = !authenticated;
  translatorTools.hidden = !authenticated;
  authControls.hidden = !authenticated;
  authAccount.textContent = authenticated ? authenticatedUser.email : '';
}

function getItem(item) {
  return state.get(item.id) || item;
}

function addSentencePeriod(source, output, mode) {
  const text = String(output || '').trimEnd();
  if (!text || /[。！？!?…](?:[」』）》】〕〉”’"')\]]*)$/u.test(text)) return text;

  const words = String(source || '').trim().split(/\s+/u).filter(Boolean);
  const japaneseCharacters = [...text].filter((character) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)).length;
  const sentenceLike = words.length >= 3 ||
    (words.length >= 2 && japaneseCharacters >= 8) ||
    (mode === 'japanese' && japaneseCharacters >= 12);

  return sentenceLike ? `${text}。` : text;
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
  const copy = composeCopyText(documentModel, getItem);
  const done = items.filter((item) => getItem(item).status === 'done').length;
  const followResults = shouldFollowResults();
  const visibleLineCount = sourceText.value ? documentModel.length - (sourceText.value.endsWith('\n') ? 1 : 0) : 0;
  lineCount.textContent = `${visibleLineCount} 行`;
  convertedCount.textContent = `${done} / ${items.length}`;
  totalChars.textContent = `${items.reduce((sum, item) => sum + (getItem(item).output || '').length, 0)} 文字`;
  const status = getDocumentStatus(documentModel, getItem);
  const statusText = { loading: '変換中', error: '一部失敗', draft: '未確定', done: '完了' }[status] || '待機中';
  globalStatus.textContent = statusText;
  globalStatus.className = `status-pill status-${status || 'pending'}`;
  globalStatus.dataset.tooltip = `状態: ${statusText}`;
  globalStatus.setAttribute('aria-label', `状態: ${statusText}`);
  modeHint.textContent = modeMeta[currentMode].hint;
  convertAllButton.disabled = status === 'loading';
  copyButton.disabled = !copy.ready;
  copyButton.dataset.tooltip = copy.ready
    ? '変換結果をコピー（⌘+Shift+Enter / Ctrl+Shift+Enter）'
    : 'すべての変換が完了するとコピーできます';
  copyButton.setAttribute('aria-label', copy.ready ? '変換結果をコピー' : 'すべての変換が完了するとコピーできます');

  if (!documentModel.some((line) => line.segments.length)) {
    results.className = 'results empty';
    results.textContent = '⌘+Enterで変換（Windows/LinuxはCtrl+Enter）。完了後は⌘+Shift+Enterで全文コピー（Windows/LinuxはCtrl+Shift+Enter）。';
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

function clearPrivateView() {
  historyRecords = [];
  dictionaryEntries = [];
  cancelDictionaryEdit();
  sourceText.value = '';
  state.clear();
  rebuildDocument();
  renderHistory();
  renderDictionary();
  render();
}

async function requireLogin(messageText = 'ログインの有効期限が切れました。再度ログインしてください。') {
  setAuthenticatedUser(null);
  clearPrivateView();
  authMessage.textContent = messageText;
  await initializeGoogleSignIn();
}

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('Googleログインを読み込めませんでした。')), { once: true });
    document.head.append(script);
  });
}

async function handleGoogleCredential(response) {
  authMessage.textContent = 'Googleアカウントを確認しています…';
  try {
    const result = await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error || 'Googleログインに失敗しました。');
    setAuthenticatedUser(data.user);
    authMessage.textContent = '';
    setMessage(`${data.user.email} でログインしました。`);
    await Promise.all([loadHistory(), loadDictionary()]);
  } catch (error) {
    authMessage.textContent = error.message || 'Googleログインに失敗しました。';
  }
}

async function initializeGoogleSignIn() {
  if (googleSignInInitialized || authenticatedUser) return;
  googleSignInInitialized = true;
  try {
    const configResponse = await fetch('/api/auth/config', { cache: 'no-store' });
    const config = await configResponse.json().catch(() => ({}));
    if (!configResponse.ok || !config.clientId) {
      authMessage.textContent = config.error || 'Googleログインの設定が完了していません。';
      return;
    }
    await loadGoogleIdentityServices();
    window.google.accounts.id.initialize({
      client_id: config.clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    window.google.accounts.id.renderButton(googleSignIn, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: 260
    });
  } catch (error) {
    authMessage.textContent = error.message || 'Googleログインを読み込めませんでした。';
  }
}

async function initializeAuth() {
  setAuthenticatedUser(null);
  authMessage.textContent = 'ログイン状態を確認しています…';
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.authenticated && data.user?.email) {
      setAuthenticatedUser(data.user);
      authMessage.textContent = '';
      await Promise.all([loadHistory(), loadDictionary()]);
      return;
    }
    authMessage.textContent = '';
    await initializeGoogleSignIn();
  } catch {
    authMessage.textContent = 'ログイン状態を確認できませんでした。ページを再読み込みしてください。';
  }
}

async function logout() {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'DELETE', credentials: 'same-origin'
    });
    if (!response.ok) throw new Error('ログアウトできませんでした。');
    window.google?.accounts?.id?.disableAutoSelect?.();
    clearPrivateView();
    setAuthenticatedUser(null);
    authMessage.textContent = 'ログアウトしました。';
    googleSignInInitialized = false;
    await initializeGoogleSignIn();
  } catch (error) {
    setMessage(error.message || 'ログアウトできませんでした。', true);
  }
}

async function requestTranslation(items, mode) {
  const response = await fetch('/api/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, items: items.map((item) => ({ id: item.id, text: item.source })) })
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) void requireLogin(data.error);
  if (!response.ok) throw new Error(data.error || '変換サービスを利用できません。');
  if (!Array.isArray(data.results)) throw new Error('変換結果を読み取れませんでした。');
  return data.results;
}

async function translateTargets(targets, successMessage = '') {
  const translatedDocumentVersion = requestVersion;
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
        state.set(item.id, {
          ...item,
          status: 'done',
          output: addSentencePeriod(item.text, result.output, mode),
          errorCode: null,
          token: serial
        });
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
  if (translatedDocumentVersion === requestVersion && getDocumentStatus(documentModel, getItem) === 'done') {
    void saveHistory(translatedDocumentVersion);
  }
}

function renderHistory() {
  if (!historyList) return;
  if (!historyRecords.length) {
    historyList.textContent = '保存された履歴はありません。';
    return;
  }

  historyList.replaceChildren(...historyRecords.map((record) => {
    const item = document.createElement('details');
    item.className = 'history-item';
    const summary = document.createElement('summary');
    const date = new Date(record.createdAt);
    const dateText = Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
    const preview = record.source.replace(/\s+/g, ' ').slice(0, 72);
    summary.textContent = `${dateText} · ${preview}${record.source.length > 72 ? '…' : ''}`;

    const content = document.createElement('div');
    content.className = 'history-content';
    const modeLabel = document.createElement('h3');
    modeLabel.textContent = record.mode === 'japanese' ? '日本語整形' : 'ローマ字変換';
    const sourceLabel = document.createElement('h3');
    sourceLabel.textContent = '入力';
    const sourceValue = document.createElement('pre');
    sourceValue.textContent = record.source;
    const resultLabel = document.createElement('h3');
    resultLabel.textContent = '変換結果';
    const resultValue = document.createElement('pre');
    resultValue.textContent = record.result;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'history-restore';
    restore.textContent = 'この入力を編集欄に戻す';
    restore.addEventListener('click', () => {
      setMode(record.mode);
      sourceText.value = record.source;
      rebuildDocument();
      resizeSourceText();
      render();
      setMessage('入力を戻しました。必要に応じてもう一度変換してください。');
      sourceText.focus();
    });
    content.append(modeLabel, sourceLabel, sourceValue, resultLabel, resultValue, restore);
    item.append(summary, content);
    return item;
  }));
}

function renderDictionary() {
  dictionaryCount.textContent = `${dictionaryEntries.length} / 100語`;
  if (!dictionaryEntries.length) {
    dictionaryList.textContent = '登録した単語はありません。';
    return;
  }
  dictionaryList.replaceChildren(...dictionaryEntries.map((entry) => {
    const row = document.createElement('div');
    row.className = 'dictionary-item';
    const words = document.createElement('div');
    words.className = 'dictionary-words';
    const reading = document.createElement('span');
    reading.textContent = entry.reading;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    const replacement = document.createElement('strong');
    replacement.textContent = entry.replacement;
    words.append(reading, arrow, replacement);

    const actions = document.createElement('div');
    actions.className = 'dictionary-item-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'history-refresh';
    edit.textContent = '編集';
    edit.addEventListener('click', () => {
      dictionaryEditingId = entry.id;
      dictionaryReading.value = entry.reading;
      dictionaryReplacement.value = entry.replacement;
      dictionarySubmit.textContent = '変更を保存';
      dictionaryCancel.hidden = false;
      dictionaryMessage.textContent = '';
      dictionaryDetails.open = true;
      dictionaryReading.focus();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-refresh';
    remove.textContent = '削除';
    remove.addEventListener('click', () => void deleteDictionaryEntry(entry));
    actions.append(edit, remove);
    row.append(words, actions);
    return row;
  }));
}

function cancelDictionaryEdit() {
  dictionaryEditingId = null;
  dictionaryForm?.reset();
  if (dictionarySubmit) dictionarySubmit.textContent = '登録する';
  if (dictionaryCancel) dictionaryCancel.hidden = true;
  if (dictionaryMessage) dictionaryMessage.textContent = '';
}

async function loadDictionary() {
  dictionaryList.textContent = '登録語を読み込み中…';
  try {
    const response = await fetch('/api/dictionary', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await requireLogin(data.error);
      return;
    }
    if (!response.ok) throw new Error(data.error || '単語登録を読み込めませんでした。');
    dictionaryEntries = Array.isArray(data.entries) ? data.entries : [];
    renderDictionary();
  } catch (error) {
    dictionaryList.textContent = error.message || '単語登録を読み込めませんでした。';
  }
}

async function saveDictionaryEntry(event) {
  event.preventDefault();
  dictionaryMessage.textContent = '';
  dictionarySubmit.disabled = true;
  try {
    const response = await fetch('/api/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dictionaryEditingId || undefined,
        reading: dictionaryReading.value,
        replacement: dictionaryReplacement.value
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await requireLogin(data.error);
      return;
    }
    if (!response.ok) throw new Error(data.error || '単語登録を保存できませんでした。');
    cancelDictionaryEdit();
    await loadDictionary();
    setMessage('単語登録を保存しました。次のローマ字変換から反映されます。');
  } catch (error) {
    dictionaryMessage.textContent = error.message || '単語登録を保存できませんでした。';
  } finally {
    dictionarySubmit.disabled = false;
  }
}

async function deleteDictionaryEntry(entry) {
  if (!window.confirm(`「${entry.reading} → ${entry.replacement}」を削除しますか？`)) return;
  try {
    const response = await fetch('/api/dictionary', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await requireLogin(data.error);
      return;
    }
    if (!response.ok) throw new Error(data.error || '単語登録を削除できませんでした。');
    if (dictionaryEditingId === entry.id) cancelDictionaryEdit();
    await loadDictionary();
    setMessage('単語登録を削除しました。');
  } catch (error) {
    dictionaryMessage.textContent = error.message || '単語登録を削除できませんでした。';
  }
}

async function loadHistory() {
  if (!historyList) return;
  historyList.textContent = '履歴を読み込み中…';
  try {
    const response = await fetch('/api/history', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await requireLogin(data.error);
      return;
    }
    if (!response.ok) throw new Error(data.error || '履歴を読み込めませんでした。');
    historyRecords = Array.isArray(data.history) ? data.history : [];
    renderHistory();
  } catch (error) {
    historyList.textContent = error.message || '履歴を読み込めませんでした。';
  }
}

async function saveHistory(expectedVersion) {
  const copy = composeCopyText(documentModel, getItem);
  if (requestVersion !== expectedVersion || !copy.ready || !sourceText.value.trim()) return;
  try {
    const response = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: currentMode, source: sourceText.value, result: copy.text })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await requireLogin(data.error);
      return;
    }
    if (!response.ok) throw new Error(data.error || '履歴を保存できませんでした。');
    historyRecords = Array.isArray(data.history) ? data.history : [];
    renderHistory();
  } catch (error) {
    setMessage(`変換は完了しましたが、履歴を保存できませんでした。${error.message ? ` ${error.message}` : ''}`, true);
  }
}
function translateAll() {
  const targets = getAllTranslatableItems(documentModel, getItem);
  if (!targets.length) {
    const status = getDocumentStatus(documentModel, getItem);
    return setMessage(status === 'done' ? 'すべて変換済みです。' : '変換する入力がありません。', status !== 'done');
  }
  void translateTargets(targets, '全体を変換しました。');
}

async function copyResult() {
  const copy = composeCopyText(documentModel, getItem);
  if (!copy.ready) return setMessage('未確定・処理中・失敗の項目があるためコピーできません。', true);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copy.text);
    } else if (!copyWithTemporaryTextArea(copy.text)) {
      throw new Error('clipboard_unavailable');
    }
    setMessage('変換結果をコピーしました。');
  } catch {
    if (copyWithTemporaryTextArea(copy.text)) {
      setMessage('変換結果をコピーしました。');
    } else {
      setMessage('コピー権限がありません。', true);
    }
  }
}

function copyWithTemporaryTextArea(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.append(textArea);
  try {
    textArea.select();
    return document.execCommand('copy');
  } finally {
    textArea.remove();
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
document.addEventListener('keydown', (event) => {
  if (!event.metaKey && !event.ctrlKey) return;
  if (event.altKey || event.isComposing || event.keyCode === 229 || event.key !== 'Enter') return;

  event.preventDefault();
  if (event.shiftKey) {
    void copyResult();
  } else {
    translateAll();
  }
});
copyButton.addEventListener('click', () => void copyResult());
clearButton.addEventListener('click', clearAll);
modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode === 'japanese' ? 'japanese' : 'romaji')));
heightButtons.forEach((button) => button.addEventListener('click', () => setDisplayHeight(button.dataset.height, true)));
refreshHistoryButton?.addEventListener('click', () => void loadHistory());
dictionaryForm?.addEventListener('submit', (event) => void saveDictionaryEntry(event));
dictionaryCancel?.addEventListener('click', cancelDictionaryEdit);
logoutButton?.addEventListener('click', () => void logout());
sourceText.addEventListener('input', () => {
  rebuildDocument();
  setMessage('');
  render();
});

window.addEventListener('resize', resizeSourceText);
setDisplayHeight(displayHeight);
resizeSourceText();
render();
void initializeAuth();
