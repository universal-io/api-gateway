// R18 voice companion (experiment): the one description of a Live session.
//
// The token route locks this setup into a single-use ephemeral token and
// hands the same object back to the client, which sends it verbatim as the
// WebSocket `setup` message. There is no second copy of the persona anywhere.
//
// The shape is the Gemini Developer API's BidiGenerateContentSetup on the
// wire (the same JSON @google/genai produces from a LiveConnectConfig), so
// no SDK is needed here. Ported from app-web's voice POC
// (lib/live/config.ts, docs/voice-companion-native.md).

import { LIVE_MODEL } from "@/lib/server/ai-routing";

export const LIVE_VOICES = [
  "Kore",
  "Aoede",
  "Leda",
  "Zephyr",
  "Puck",
  "Charon",
  "Fenrir",
  "Orus",
] as const;
export type LiveVoice = (typeof LIVE_VOICES)[number];
export const DEFAULT_LIVE_VOICE: LiveVoice = "Kore";

/**
 * Who marks where each of the user's utterances starts and ends.
 *
 * - "server": the Live API's automatic activity detection, as tuned in
 *   liveSetup. Build 19 of the app relies on it, so it stays the default.
 * - "client": automatic detection is off; the client sends activityStart and
 *   activityEnd around each utterance. Probed 2026-10-08 on gemini-3.8-live:
 *   the server detection cut Japanese utterances at short pauses and the model
 *   misunderstood the pieces, while client-marked utterances arrived whole and
 *   were understood. An activityStart interrupted an answer within 60 ms;
 *   clientContent with turnComplete=false sent mid-answer did not.
 */
export type LiveTurns = "server" | "client";
export const DEFAULT_LIVE_TURNS: LiveTurns = "server";

/**
 * How a look_closely call is answered.
 *
 * - "sync": the tool response is the eye's answer, 5–7 s later. Builds up to
 *   24 send nothing and get this.
 * - "async": the client answers at once with 「田中さんが確認中です。」, and the
 *   eye's answer arrives later as a turn starting 「（田中さんから）」. Gemini 3.1
 *   Flash Live does not take asynchronous function calls (it says nothing
 *   until the tool response), so the client makes the wait asynchronous: the
 *   companion keeps talking while the eye reads (owner, 2026-10-09). Probed
 *   2026-10-09 on 3.1 with this wording: it said one line
 *   (「田中さんに確認してもらいますね。」) in about 0.7 s, answered side
 *   questions, guessed about the screen 0 times in 20 sessions, and relayed
 *   the later answer with the 「」 names exact. The sync wording read the
 *   acknowledgement aloud instead (2 of 3).
 */
export type LiveLook = "sync" | "async";
export const DEFAULT_LIVE_LOOK: LiveLook = "sync";

/** Long enough for an hour of talking. The token is single-use and only
 * opens a session during its first minute; every reconnect mints a new one. */
export const LIVE_TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const LIVE_NEW_SESSION_WINDOW_MS = 60 * 1000;

export const LOOK_CLOSELY = "look_closely";

/**
 * 隣の親切な人。
 *
 * Native-audio models pick the spoken language themselves and accept no
 * language code for it, so the language is pinned in the wording Google
 * recommends. The persona is deliberately flat: the model leans toward
 * praise, so the instruction rules out evaluation.
 *
 * Rewritten 2026-10-08. The previous persona promised a running list of the
 * visible elements (「いま見えている画面」) that the app never sent, so the
 * model guided from the coarse video and named controls it could not read.
 * This one uses the video only to tell which app and which screen. Before
 * saying where, which or how about a control, or reading a number off a
 * table, it calls look_closely and speaks the names that come back without
 * adding its own; an element list the app may send can be named but never
 * decides a step. It also stays silent on sounds that are not words (no
 * "pardon?"), says 「画面に目印を出しました。」 only when the result reports a
 * mark, and relays the 「（次の一歩）」 messages the system sends after the
 * user has acted on a step.
 *
 * Unchanged from the first version: the greeting names the app in front. The
 * client sends 「いま前面にあるアプリ」 before 「（開始）」, and both the client
 * and the tests rely on those words.
 */
export const LIVE_SYSTEM_INSTRUCTION = `あなたはユーザーの隣に座っている、親切で落ち着いた人です。名前は山田です。ユーザーはPCで作業をしながら、ときどき声であなたに話しかけます。

話し方:
- 必ず日本語で、です・ます調で話します。RESPOND IN JAPANESE. YOU MUST RESPOND UNMISTAKABLY IN JAPANESE.
- 人と話すように短く答えます。基本は1〜2文。聞かれたことにだけ答えます。
- 話しかけられたとき以外は黙っています。ユーザーの独り言や、ほかの人との会話には反応しません。
- 言葉として聞き取れない音（物音、咳、キーボードの音、雑音、ため息）しか届かなかったときは、何も言わずに黙っています。聞き返しもしません。
- 「いいですね」「素晴らしい」のような評価や褒め言葉は言いません。謝るのは必要なときに一度、一言だけです。
- あなたはクリックも入力もできません。できるのは、話すことと、画面に目印を出すことだけです。
- look_closely や読み手など、仕組みの話はユーザーにしません。

画面について（最も重要）:
- あなたに届く画面の映像は粗く、ボタンやメニューの文字は正確に読めません。映像は「何のアプリの、どんな画面か」をつかむためだけに使います。
- 「いま見えている要素（アプリが取得）」という知らせが届くことがあります。画面に実在する要素の名前と大まかな場所の一覧です。返事はしません。そこにある名前は口にしてよいですが、操作の手順や「どれを押せばよいか」は一覧から自分で判断せず、look_closely で確かめます。
- ボタン・メニュー・タブ・リンク・入力欄について「どこ」「どれ」「どうやる」を答えるとき、表やグラフの数値を答えるときは、答える前に必ず look_closely を呼びます。前の結果のあとにユーザーが操作した、または画面が変わったと思われるときも呼び直します。
- 画面と関係のない話（雑談や一般的な知識）には、look_closely を呼ばずに答えます。

look_closely の呼び方:
- question には、ユーザーが知りたいことを、ユーザーの言葉をなるべくそのまま使って書きます。
- goal には、会話の中でユーザーが決めた最終的な目的（例:「直近1か月のアクセス数を見る」）を、毎回同じ言葉で書きます。「次は？」と聞かれたとき、案内の誤りを指摘されたとき、確認の質問をされたときも、目的は変えません。ユーザーがはっきり別の目的を言ったときだけ書き換えます。分からなければ空にします。
- ユーザーが前の案内を済ませた、または「次は？」と聞いたときは、next_step を true にします。
- 「これ」「ここ」「この」がマウスカーソルの場所を指しているときは、points_at_cursor を true にします。
- 呼んだあとは、結果が来るまで何も言いません。つなぎの「確認しますね」はシステムが流します。

結果の伝え方:
- 結果が来たら、前置きなしに「言うこと」をほぼそのまま言います。整えてよいのは語尾だけで、「」の中の名前は一字も変えません。手順は一度に1つだけです。
- 「目印」が「出した」のときだけ、最後に「画面に目印を出しました。」と添えます。「なし」のときは、目印のことは言いません。
- 「言うこと」が「この画面には見当たりません」で始まるときは、そのまま正直に伝えます。自分で別の候補を足しません。
- 「種類」が「相談」のときは、言うことを伝えたあと、ユーザーの返事を待ちます。ログイン・支払い・同意などを、ユーザーの代わりに決めません。
- 「種類」が「失敗」のときは、「うまく見られませんでした。もう一度言っていただけますか？」とだけ言います。

案内の続き:
- 「（次の一歩）」で始まる知らせは、ユーザーが前の案内どおりに操作し、システムが新しい画面を読んだ結果です。「はい」などの相づちや前置きを付けずに、その「言うこと」を上の「結果の伝え方」と同じ決まりで伝えます。
- 「種類」が「完了」なら、目的の画面に着いたことを一言で伝えます。

案内の決まり:
- ユーザーに「無い」「見つからない」「違う」と言われたら、謝りは一言だけにして、同じ目的のまま look_closely を next_step=true で呼び直し、question にユーザーの指摘をそのまま書きます。挨拶や「何かお困りですか」に戻ってはいけません。指摘されたものは二度と案内しません。
- 同じ案内を2回繰り返しません。行き詰まったら「分かりません」と言い、画面のどこを見ているか教えてもらいます。

始め方:
- 「いま前面にあるアプリ」という知らせが届きます。返事はしません。
- 「（開始）」と言われたら、名乗ってから、その知らせのアプリに一言触れて、何に困っているかを短く聞きます（例:「こんにちは、山田です。いまGoogle アナリティクスを見ていますね。何かお困りですか？」）。知らせが届いていなければ、名乗って聞くだけにします。`;

/** The setup message body (`{"setup": <this>}`) for one connection. */
/** The persona for one way of answering looks (see LiveLook). */
export function liveSystemInstruction(look: LiveLook): string {
  if (look === "sync") return LIVE_SYSTEM_INSTRUCTION;
  const swaps: [string, string][] = [
    [
      "- look_closely や読み手など、仕組みの話はユーザーにしません。",
      "- look_closely など、仕組みの話はユーザーにしません。",
    ],
    [
      "- 呼んだあとは、結果が来るまで何も言いません。つなぎの「確認しますね」はシステムが流します。",
      "- 呼ぶと、すぐに「田中さんが確認中です」と返ってきます。そうしたら「田中さんに確認してもらいますね。」と一言だけ言います。結果は、あとから「（田中さんから）」で始まる知らせで届きます。届くまでは、ほかの話には普通に答えますが、画面のことは推測で答えません。",
    ],
    [
      "- 結果が来たら、前置きなしに「言うこと」を",
      "- 「（田中さんから）」で始まる知らせが届いたら、前置きなしに「言うこと」を",
    ],
  ];
  return swaps.reduce((text, [from, to]) => {
    // A swap that no longer matches would leave the sync wording in place
    // silently; the persona and this list change together.
    if (!text.includes(from)) throw new Error(`async persona: missing line: ${from}`);
    return text.replace(from, to);
  }, LIVE_SYSTEM_INSTRUCTION);
}

export function liveSetup(options: { voice: LiveVoice; handle?: string; turns?: LiveTurns; look?: LiveLook }) {
  const turns = options.turns ?? DEFAULT_LIVE_TURNS;
  const look = options.look ?? DEFAULT_LIVE_LOOK;
  return {
    model: `models/${LIVE_MODEL.modelId}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } },
      },
      // What dense text needs (12px Japanese survived it in the POC).
      mediaResolution: "MEDIA_RESOLUTION_HIGH",
    },
    systemInstruction: { role: "user", parts: [{ text: liveSystemInstruction(look) }] },
    tools: [
      {
        functionDeclarations: [
          {
            name: LOOK_CLOSELY,
            // The voice may keep talking while the read runs. In practice it
            // stays silent, which is why the client plays the bridge phrase.
            behavior: "NON_BLOCKING",
            description:
              "読み手がいまの画面を精読し、ユーザーに伝える一言（言うこと）と、画面に目印を出したかどうかを返す。画面のボタン・メニュー・場所・操作手順・表の数値について話す前に必ず呼ぶ。",
            parameters: {
              type: "OBJECT",
              properties: {
                question: {
                  type: "STRING",
                  description:
                    "ユーザーが知りたいこと。ユーザーの言葉をなるべくそのまま使い、会話の流れで補って具体的に書く。",
                },
                goal: {
                  type: "STRING",
                  description: "ユーザーが最終的にやりたいこと。分からなければ空文字。",
                },
                next_step: {
                  type: "BOOLEAN",
                  description:
                    "ユーザーが前の案内を済ませた、または『次は？』と聞いたときだけ true。",
                },
                points_at_cursor: {
                  type: "BOOLEAN",
                  description: "『これ』『ここ』『この』がマウスの位置を指しているときだけ true。",
                },
              },
              required: ["question"],
            },
          },
        ],
      },
    ],
    // Both transcripts: native-audio models have no text output modality, so
    // this is the only record of what was said and heard. The input side is
    // pinned to Japanese because automatic language detection produced
    // non-Japanese fragments; gemini-3.8-live accepts languageCodes (probed
    // 2026-10-08, setupComplete).
    inputAudioTranscription: { languageCodes: ["ja-JP"] },
    outputAudioTranscription: {},
    // The two walls of an hour-long session: the connection drops at ~10
    // minutes (resume with the handle), and an audio+video session ends at
    // 2 minutes without compression.
    sessionResumption: options.handle ? { handle: options.handle } : {},
    // Compression starts early, as in Google's best-practices example. The
    // default waits until ~100k tokens, and every turn is billed for the
    // whole context until then.
    contextWindowCompression: { triggerTokens: 25_000, slidingWindow: { targetTokens: 8_000 } },
    // See LiveTurns. The server profile is unchanged because build 19 relies on it.
    realtimeInputConfig:
      turns === "client"
        ? { automaticActivityDetection: { disabled: true } }
        : {
            automaticActivityDetection: {
              startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
              endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
              prefixPaddingMs: 300,
              // Japanese turn-taking is fast; the server default (~800ms) felt slow.
              silenceDurationMs: 600,
            },
          },
  };
}

export type LiveSetup = ReturnType<typeof liveSetup>;

/**
 * Body of `POST v1beta/auth_tokens`. Without a `fieldMask` the whole setup is
 * locked: the client cannot change the model, the persona or the tools.
 */
export function liveTokenRequestBody(setup: LiveSetup, now: number) {
  return {
    uses: 1,
    expireTime: new Date(now + LIVE_TOKEN_LIFETIME_MS).toISOString(),
    newSessionExpireTime: new Date(now + LIVE_NEW_SESSION_WINDOW_MS).toISOString(),
    bidiGenerateContentSetup: setup,
  };
}

export const LIVE_TOKEN_TIMEOUT_MS = 15_000;

/** Mints the token. Never includes the key or the upstream body in errors. */
export async function mintLiveToken(apiKey: string, setup: LiveSetup, now = Date.now()) {
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(liveTokenRequestBody(setup, now)),
      signal: AbortSignal.timeout(LIVE_TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`Live token did not arrive within ${LIVE_TOKEN_TIMEOUT_MS}ms.`);
    }
    throw new Error("Live token request failed to reach the provider.");
  }
  if (!response.ok) throw new Error(`Live token HTTP ${response.status}`);
  const json = (await response.json().catch(() => null)) as { name?: unknown } | null;
  const token = typeof json?.name === "string" ? json.name : "";
  if (!token.startsWith("auth_tokens/")) throw new Error("Live token response had no token.");
  return {
    token,
    expiresAt: new Date(now + LIVE_TOKEN_LIFETIME_MS).toISOString(),
    newSessionExpiresAt: new Date(now + LIVE_NEW_SESSION_WINDOW_MS).toISOString(),
  };
}

export function parseLiveVoice(value: unknown): LiveVoice | null {
  if (value === undefined) return DEFAULT_LIVE_VOICE;
  return LIVE_VOICES.find((voice) => voice === value) ?? null;
}

export function parseLiveTurns(value: unknown): LiveTurns | null {
  if (value === undefined) return DEFAULT_LIVE_TURNS;
  return value === "server" || value === "client" ? value : null;
}

export function parseLiveLook(value: unknown): LiveLook | null {
  if (value === undefined) return DEFAULT_LIVE_LOOK;
  return value === "sync" || value === "async" ? value : null;
}
