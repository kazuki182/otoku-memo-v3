# おとくメモ v26

## 更新内容

- HOMEと各機能を下部ボタンで完全に分離
- 下部固定ボタンにHOMEを追加
- HOMEは使い方ガイド、登録件数、ChatGPT起動、容量比較だけに整理
- 商品登録・価格登録はそれぞれ専用画面で操作
- Supabaseの古いschemaでもproduct_name列を追加できるようにschema.sqlを補強
- 商品登録時にSupabaseのschema cacheエラーが出た場合の案内を強化

## 上書きファイル

以下5ファイルをGitHubに上書きしてください。

- index.html
- styles.css
- app.js
- schema.sql
- README.md

## Supabase

今回のエラー対策として、SupabaseのSQL Editorでschema.sqlを再実行してください。
既存データは消さず、必要な列だけ追加する内容です。
