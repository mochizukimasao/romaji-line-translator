import 'dotenv/config';
import express from 'express';
import { translateTextLines } from './src/lib/gemini.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.post('/api/translate', async (req, res) => {
  try {
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const mode = req.body?.mode === 'japanese' ? 'japanese' : 'romaji';
    if (!lines.length || lines.length > 1000) {
      return res.status(400).json({ error: '1〜1000行の入力を送ってください。' });
    }

    const normalizedLines = lines.map((line) => String(line ?? '').slice(0, 4000));
    const totalLength = normalizedLines.join('\n').length;
    if (totalLength > 120000) {
      return res.status(400).json({ error: '入力が長すぎます。少し分けて変換してください。' });
    }

    const translations = await translateTextLines(normalizedLines, {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      mode
    });

    res.json({ translations });
  } catch (error) {
    console.error(error);
    const detail = error?.message ? ` (${error.message})` : '';
    res.status(500).json({ error: `変換に失敗しました${detail}` });
  }
});

app.listen(port, () => {
  console.log(`Romaji Line Translator is running at http://localhost:${port}`);
});
