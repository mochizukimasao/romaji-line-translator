import 'dotenv/config';
import express from 'express';
import { translateRomajiLines } from './src/lib/gemini.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.static('public'));

app.post('/api/translate', async (req, res) => {
  try {
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!lines.length || lines.length > 80) {
      return res.status(400).json({ error: '1〜80行の入力を送ってください。' });
    }

    const normalizedLines = lines.map((line) => String(line ?? '').slice(0, 500));
    const totalLength = normalizedLines.join('\n').length;
    if (totalLength > 12000) {
      return res.status(400).json({ error: '入力が長すぎます。少し分けて変換してください。' });
    }

    const translations = await translateRomajiLines(normalizedLines, {
      apiKey: process.env.GEMINI_API_KEY,
      model
    });

    res.json({ translations });
  } catch (error) {
    console.error(error);
    const detail = error?.message ? ` (${error.message})` : '';
    res.status(500).json({ error: `Gemini での変換に失敗しました${detail}` });
  }
});

app.listen(port, () => {
  console.log(`Romaji Line Translator is running at http://localhost:${port}`);
});
