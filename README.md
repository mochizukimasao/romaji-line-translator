# Romaji Line Translator

ローマ字をかなにだけ変換する小さな Web アプリです。意味の言い換え、口調の変更、意訳はしません。既存の漢字やかな、記号は保持します。

## 構成

```text
.
├── server.js
├── package.json
├── .env.example
├── functions
│   └── api
│       └── translate.js
├── src
│   └── lib
│       └── gemini.js
└── public
    ├── index.html
    ├── styles.css
    └── app.js
```

## セットアップ

```bash
npm install
cp .env.example .env
```

`.env` に Gemini API キーを設定します。

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

## 起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## Cloudflare Pages

Cloudflare Pages では次の形で載せられます。

1. GitHub にこのリポジトリを push
2. Cloudflare Pages で GitHub リポジトリを接続
3. Build command は空、Output directory は `public`
4. Environment variables に `GEMINI_API_KEY` と必要なら `GEMINI_MODEL` を設定

`functions/api/translate.js` が Pages Functions として動き、`/api/translate` を処理します。

## デプロイ設定

デプロイは GitHub Actions から Cloudflare Pages に送ります。

固定するものは次の 2 つだけです。

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

運用ルール:

1. Cloudflare の token はこのリポジトリ用に 1 つだけ使う
2. token を作り直したら GitHub Secrets も必ず同時に更新する
3. 端末ごとに別の Cloudflare ログイン状態を使わない
4. GitHub Secrets の値をローカルの `.env` で代用しない

`CLOUDFLARE_API_TOKEN` には Cloudflare Pages への書き込み権限が必要です。

## ローカル

```bash
npm run dev
```

`server.js` はローカル確認用です。Cloudflare Pages では `functions/api/translate.js` 側が使われます。
