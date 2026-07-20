# Romaji Line Translator

ローマ字を自然な漢字かな交じり文へ変換し、日本語の粗いメモを最小限整形する小さな Web アプリです。意味の言い換え、口調の変更、要約、情報追加はしません。

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
│       ├── api-request.js
│       └── gemini.js
├── public
│   ├── core.js
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── test
    ├── api-request.test.js
    ├── core.test.js
    └── gemini.test.js
```

## セットアップ

```bash
npm install
cp .env.example .env
```

`.env` に Gemini API キーを設定します。

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
PORT=3000
```

## 起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## API

`POST /api/translate`は、ローマ字変換または日本語整形の項目を受け取ります。

```json
{
  "mode": "romaji",
  "items": [
    { "id": "romaji:0:0:example", "text": "otukaresamadesu." }
  ]
}
```

```json
{
  "results": [
    {
      "id": "romaji:0:0:example",
      "status": "ok",
      "output": "お疲れ様です。",
      "errorCode": null
    }
  ]
}
```

結果は項目別に返り、失敗した項目は`status: "error"`になります。

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
