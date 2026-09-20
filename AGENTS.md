<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# api-gateway

全クライアント共通の本番Gateway。mainへのpushは `api.universal-io.com` の本番デプロイ。
gitは `git -C <絶対パス>`、npmは `npm --prefix <絶対パス>` を使い、コミット前に対象のstatusを確認する。
AIキー・Supabase service roleはサーバーだけに置く。

作業に該当する節だけ参照する:
- 開発・検証・デプロイ: [README](README.md)。
- API変更: [API契約](docs/api-contract.md)。設計方針: [設計思想](docs/design-philosophy.md)。
- 外部アカウント・OAuth・DB: [Supabase設定](docs/supabase-setup.md)。設定変更時は同文書も更新する。

Supabaseは `supabase_bomb_squad` のみ。schema/data read・SQL作業前にproject URLが
`https://skcsbcyivjcvevxntvqa.supabase.co` と完全一致することを確認する。
不一致や期待するテーブルの欠落時は停止し、正しいMCPの再接続・セッション再開を依頼する。代替DBを作らない。
書き込みごとにURLを再確認し、SQL/migrationをレビューしてユーザーの明示承認を得る。
