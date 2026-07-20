import 'dotenv/config';
import express from 'express';
import { translateItems } from './src/lib/gemini.js';
import { validateTranslateRequest } from './src/lib/api-request.js';

const app = express();
const port = Number(process.env.PORT || 3000);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.post('/api/translate', async (req, res) => {
  const validation = validateTranslateRequest(req.body);
  if (!validation.ok) return res.status(validation.status).json({ error: validation.error });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: '変換サービスの設定がありません。' });
  try {
    const results = await translateItems(validation.items, {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      mode: validation.mode
    });
    return res.json({ results });
  } catch {
    return res.status(503).json({ error: '変換サービスを利用できません。' });
  }
});

app.listen(port, () => console.log(`Romaji Line Translator is running at http://localhost:${port}`));
