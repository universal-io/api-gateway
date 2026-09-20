# Universal I/O — API Gateway

**全クライアント共通のバックエンド。** `https://api.universal-io.com` で稼働する。

このリポジトリは Universal I/O の**唯一の本番Gateway**であり、AIモデル呼び出し・認証・
テナント/権利管理・quota・課金・管理画面を所有する。macOS / iOS / Web の各クライアントは
すべてここを経由し、**AIプロバイダのAPIキーをクライアントに置かない**（ファミリー共通の規則）。

2026-08-16に `universal-io/app-mac` の `web/` から履歴ごと切り出した。切り出しの理由と
経緯は `app-web/docs/archive/requirements.md` §3・§9 を正本とする。

---

## プロダクトファミリー内の位置づけ

| リポジトリ | 正体 | デプロイ先 |
|---|---|---|
| **`api-gateway`（本リポジトリ）** | **バックエンドAPI＋認証UI＋管理画面＋課金** | **`api.universal-io.com`** |
| `app-mac` | macOSクライアント | DMG配布 |
| `app-ios` | iOS/iPadOSクライアント | App Store（予定） |
| `app-web` | Webクライアント | `universal-io.com`（ルート） |
| `web-product` | マーケティングサイト | `universal-io.com/product/*` の中継先 |

**このリポジトリはマーケティングサイトではない。** `/` は `/auth` へリダイレクトする。
製品紹介・料金ページは `web-product` にあり、そこから本ホストの `/billing/start` へ
リンクで送り込まれる。

## Routes

**AI routes（これが一覧のすべて。旧route・評価route・ローカルGateway用routeは置かない）**

- `POST /api/ai/vision` — 固定スクリーンショットの解説・質問応答・次の操作案内
- `POST /api/ai/review` — 入力文章のレビュー
- `POST /api/ai/suggest` — コンポーズの先回り文案
- `POST /api/ai/transcribe` — 音声の文字起こし

各AI routeは**認証付きGETをウォームアップとして受け付ける**（providerを呼ばず204）。

**その他**

- `/`（→`/auth`へリダイレクト）、`/auth`、`/auth/callback`、`/admin`
- `/api/account`（GET / DELETE）、`/api/admin/overview`、`/api/facts`
- `/api/billing/checkout`、`/api/billing/portal`、`/api/stripe/webhook`

## 契約

APIの正本は [docs/api-contract.md](docs/api-contract.md)。思想の正本は
[docs/design-philosophy.md](docs/design-philosophy.md)。

**モデルの順序を知るのは `lib/server/ai-routing.ts` の1ファイルだけ。** 全AI機能が一次・二次を
1つずつ持ち、一次失敗時だけ二次を1回実行する。三番目のモデルや別endpointは試さない。

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
npm test
```

環境変数は `.env.example` を正とし、**APIキーとSupabase service roleはサーバー環境にだけ置く**。
各クライアントはDebugを含め常に `https://api.universal-io.com` を参照する
（ローカルGateway・BYOK・別endpointへのfallbackは存在しない）。

## データベース

`supabase/migrations/` がスキーマの正本。主要テーブル:

| テーブル | 役割 |
|---|---|
| `bs_tenants` | 課金・所有の単位（`personal` / `enterprise`） |
| `bs_profiles` | ユーザー → 既定テナントの対応 |
| `bs_entitlements` | テナントが今何をしてよいか（plan / status / 上限） |
| `bs_plans` | プラン catalog（プランごとの quota・features の正本） |
| `bs_service_limits` | **サービス全体の月キャップ**（1行・`id = 'global'`）。freeだけ断り有料は通す |
| `bs_usage_events` | 利用記録（運用情報のみ。**画像・回答は保存しない**） |

セットアップは [docs/supabase-setup.md](docs/supabase-setup.md)。

### 上限は2段ある

**1リクエスト = 1ユニット。** `/ai/*` の全ルートで判定し、UTC月初にリセットする。
どちらも**DBの値だけで決まる**（コードにもenvにも無い）。`/admin` から見える。

| | どこ | 効く相手 | 超えたとき |
|---|---|---|---|
| テナントの月枠 | `bs_entitlements.monthly_review_limit` → 無ければ `bs_plans.monthly_usage_limit` | そのテナント | `QUOTA_EXCEEDED`（429） |
| **サービス全体の月キャップ** | `bs_service_limits.monthly_usage_limit` | **freeプランのみ**（有料は通す） | `SERVICE_CAPACITY_REACHED`（503） |

**この2つを同じコードで返してはいけない。** 前者は「あなたが使い切った」、後者は
「サービス全体が上限」で、後者を前者として伝えると、ほとんど使っていない人に
使い切ったと告げることになる。

**読めなかった上限は無制限として扱う。** 設定行が無い・プランが未知・カウントが落ちた、
はいずれも「そのまま通す」（master-plan §3.3）。守っている金額は運用者が決めた数字だが、
締め出す人数はこちら側で決められない。判定そのものは
[lib/server/service-capacity.ts](lib/server/service-capacity.ts)（テスト可能な純関数）で、
数え方とキャッシュは `lib/server/gateway.ts` にある。

**時間あたりの制限は無い。** 月枠だけなので1人が1日で使い切れる。`RATE_LIMITED` は
プロバイダ側の429の転送で、こちら側の制限ではない。

## デプロイ

Vercel（プロジェクト `universal-io-app-mac` → リネーム予定）。`main` へのpushで本番へ自動デプロイ。
**`main` への push は `api.universal-io.com` の本番反映を意味する。**
