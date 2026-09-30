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
│       ├── history.js
│       ├── translate.js
│       └── auth
│           ├── config.js
│           └── session.js
├── migrations
│   └── 0001_history.sql
├── functions/lib
│   ├── google-auth.js
│   └── read-json-limited.js
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
    ├── gemini.test.js
    ├── google-auth.test.js
    └── history-api.test.js
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

Cloudflare Pages ではWorkers AIを使って翻訳します。Google Gemini APIキーや従量課金のGoogle Cloudプロジェクトは不要です。

1. GitHub にこのリポジトリを push
2. Cloudflare Pages で GitHub リポジトリを接続
3. Build command は空、Output directory は `public`
4. `wrangler.toml` の `AI` バインディングを本番Pages Functionsへ反映

`functions/api/translate.js` が Pages Functions として動き、`/api/translate` を処理します。Workers AIの既定モデルは `@cf/google/gemma-4-26b-a4b-it` です。AIバインディングが利用できないローカル環境では簡易変換へフォールバックします。

Workers AIの無料枠はアカウント全体で1日10,000 Neuronsです。Freeプランでは上限を超えると停止します。Workers Paidプランでは無料枠超過分が課金されるため、無料運用を保証するにはCloudflareのWorkersプランがFreeであることを確認してください。AI利用量はCloudflareのWorkers AIダッシュボードで確認できます。

### Googleログインと変換履歴

- Cloudflare Access / Zero Trustは使用しません。Google Identity Servicesでログインし、Pages FunctionsがGoogle ID tokenを検証してセッションCookieを発行します。
- Google CloudでOAuthクライアント（ウェブアプリ）を作り、本番サイトのオリジンを「承認済みの JavaScript 生成元」に登録します。ログインはポップアップ方式のため、リダイレクトURIは使いません。
- Pages Functionsの設定は `wrangler.toml` で管理し、本番環境だけに `HISTORY_DB` を接続します。Pages production secretsに `GOOGLE_CLIENT_ID`（公開可能なOAuthクライアントID）、`GOOGLE_ALLOWED_EMAILS`（許可アドレス一覧）、`GOOGLE_SESSION_SECRET`（32バイト以上のランダムな秘密値）を設定します。`GEMINI_API_KEY`も維持します。秘密値や許可アドレスをコードや公開リポジトリに書きません。
- FunctionsはGoogle署名鍵・issuer・audience・有効期限・メール検証済み状態を確認し、許可リストと照合します。12時間のHttpOnly/Secure/SameSiteセッションCookieを発行し、失効後は再ログインします。
- 履歴の所有者は検証済みGoogleのemailとsubで決めます。D1に `migrations/0001_history.sql` と `migrations/0002_user_dictionary.sql` を適用し、Pages FunctionsのD1 binding名を `HISTORY_DB` にします。
- 成功した変換だけを自動保存し、各Googleアカウントで最新10件を保持します。下書きは保存しません。
- ActionsはPages FunctionsからAdvanced Mode用の `public/_worker.js` とroutesを生成してからデプロイします。

Google OAuthクライアントとPagesの環境変数・D1 bindingはGoogle Cloud / Cloudflareの各ダッシュボードで設定します。Google Cloudで追加の規約同意や権限付与が表示された場合は、内容を確認してから進めてください。

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
