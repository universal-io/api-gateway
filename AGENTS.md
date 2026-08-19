<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 🔑 アカウントと外部サービス（毎回忘れるので最初に読む）

**このプロダクトの外部設定は複数のGoogleアカウントに散っている。**
探し始める前にここを見ること。一度、OAuthクライアントを別アカウントのプロジェクトで
探し回って見つけられず、「Googleサインインは設定されていない」と誤って結論した。

| 何 | どこ | 備考 |
|---|---|---|
| **Google認証（OAuth）のGCP** | **`whatifepxyz@gmail.com`** | ここ以外のアカウントでは**プロジェクトの存在すら見えない**（`resourcemanager.projects.get` が403）。「無い」と誤認しやすい |
| ↳ プロジェクト番号 | `899703844772` | `https://console.cloud.google.com/auth/clients?project=899703844772` |
| ↳ OAuthクライアント名 | `Supabase Auth Client` | Client ID `899703844772-akc49a6icvjt6q7q44a9iqm6g80gjog4.apps.googleusercontent.com`（公開値） |
| ↳ OAuth同意画面 | 同じプロジェクト内 | ユーザーに見えるアプリ名はここ。別プロジェクトで整えても効果はない |
| **Gemini APIキー** | `matsumotokaya@gmail.com` の `My First Project`（番号 `118986914562`） | `universal-io` という名前だが**認証とは無関係**。Gateway の `GEMINI_API_KEY`。Google Cloud が「認証情報」に人の認証と機械の認証を並べているだけ |
| **Supabase** | organization `whatif-ep` / project `bomb-squad` | app-mac・api-gateway・app-web が**同一プロジェクトを共有**。だから同じアカウント・同じテナント・同じ利用枠になる |
| **顧客向け問い合わせ先** | **`info@universal-io.com`** | 届け先は `matsumotokaya@gmail.com` |

**Client ID の先頭の数字がGCPのプロジェクト番号。** 迷ったらこれで辿れる。

**Client Secret は Google 側で再表示できない。** Supabase に入っている値が唯一の在処で、
紛失したら新しいシークレットを追加してローテーションする。

**6か月使われないOAuthクライアントは削除対象**（Googleの通知あり、削除後30日は復元可）。

