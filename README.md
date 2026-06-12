# おとくメモ flat版 v18

## 更新内容

- ログインページとメイン画面を完全分離
  - ログイン中に下部タブやメイン画面が残って見える問題を修正
  - ログイン後はメイン画面だけ表示
  - ログアウト後はログイン画面だけ表示

- ChatGPT解析結果の取り込み改善
  - JSONだけでなく、コードブロック付きJSONや「商品名：牛乳」のような日本語形式にも対応
  - 商品写真AI結果を「入力欄に反映」または「反映して製品登録」できるように変更
  - 容量が「1000ml」のように返ってきても容量と単位に分けて反映

- スマホでVercelログインを求められる場合の案内を追加
  - Preview URLではなくProduction URLを使う
  - 必要に応じてVercelのDeployment Protectionを確認

## 上書きするファイル

- index.html
- styles.css
- app.js
- schema.sql
- README.md

## 注意

SupabaseのSQL再実行は必須ではありません。

スマホでVercelログイン画面が出る場合は、Vercelのプロジェクト画面でProduction URLを開いてください。URLに `git-main` が入っている場合はPreview URLです。
