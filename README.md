# おとくメモ 静的版

GitHubのブラウザアップロードでフォルダ構造が崩れる環境向けの、ルート直下ファイルだけで動く版です。

## GitHubへ入れるファイル

- index.html
- styles.css
- app.js
- schema.sql
- README.md

## Supabase

Supabase SQL Editorで `schema.sql` の中身を実行してください。

## Vercel

VercelでこのリポジトリをImportするだけでOKです。環境変数は不要です。
公開後、アプリ画面右上の「設定」からSupabase URLとPublishable keyを入力してください。

Supabase URLは `/rest/v1/` を消したものです。
例: `https://xxxxx.supabase.co`
