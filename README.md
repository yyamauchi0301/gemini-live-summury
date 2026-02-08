# Gemini Live API リアルタイム要約

Web Speech APIで音声入力し、Gemini 2.5 Live APIでリアルタイム要約を行うデモです。

## セットアップ

1. 依存関係をインストール
   ```
   npm install
   ```

2. 環境変数を設定
   ```
   copy .env.example .env
   ```
   `.env` の `GEMINI_API_KEY` にAPIキーを設定してください。

3. 開発サーバー起動
   ```
   npm run dev
   ```

4. ブラウザで表示されたURLにアクセスし、「音声認識を開始」をクリックします。

## 使い方

- 画面の「音声認識を開始」をクリックして話してください。
- 認識されたテキストが「認識テキスト」欄に表示されます。
- その内容がGeminiに送られ、要約がリアルタイムで更新されます。

## 注意点

- Web Speech APIはHTTPSまたは`localhost`でのみ動作します。
- APIキーはクライアント側に露出します。本番利用はエフェメラルトークンを推奨します。
  - 参考: https://ai.google.dev/gemini-api/docs/live-guide?hl=ja
