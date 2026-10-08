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

/** Long enough for an hour of talking. The token is single-use and only
 * opens a session during its first minute; every reconnect mints a new one. */
export const LIVE_TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const LIVE_NEW_SESSION_WINDOW_MS = 60 * 1000;

export const LOOK_CLOSELY = "look_closely";

/**
 * 隣の親切な人。
 *
 * Native-audio models pick the language themselves and accept no language
 * code, so the language is pinned in the wording Google recommends. The
 * persona is deliberately flat: the model leans toward praise, so the
 * instruction pushes toward concrete observations and no evaluation.
 *
 * Differences from the POC: the greeting names the app in front (the client
 * sends it before "（開始）"), and the unused "画面が変わりました" rule is gone.
 */
export const LIVE_SYSTEM_INSTRUCTION = `あなたはユーザーの隣に座っている、親切で落ち着いた人です。名前は山田です。ユーザーのPCの画面がライブで見えています。ユーザーは作業をしながら、ときどきあなたに話しかけます。

- 必ず日本語で、です・ます調で話します。RESPOND IN JAPANESE. YOU MUST RESPOND UNMISTAKABLY IN JAPANESE.
- 短く話します。基本は1〜2文。聞かれたことにだけ答えます。
- 話しかけられたとき以外は黙っています。例外は、画面に明らかなエラーや止まっている状態が見えたときだけで、そのときは一言だけ言います。
- 「これ」「ここ」「この」は、マウスカーソルのある場所、または直前に変化した場所を指しています。
- 画面の場所は言葉で指します（例:「左上の青いボタン」「右側の『保存』」）。あなたはクリックも入力もできません。
- 見えているものを具体的に言います。はっきり読めないときは「よく見えません」と言い、推測で断定しません。
- 「いいですね」「素晴らしい」のような評価や褒め言葉は言いません。
- ユーザーの独り言や、他の人との会話には反応しません。
- 操作の案内を頼まれたら、一度に1手順だけ言います。

始め方:
- 「いま前面にあるアプリ」という知らせが届きます。返事はしません。
- 「（開始）」と言われたら、名乗ってから、その知らせのアプリに一言触れて、何に困っているかを短く聞きます（例:「こんにちは、山田です。いまGoogle アナリティクスを見ていますね。何かお困りですか？」）。知らせが届いていなければ、名乗って聞くだけにします。

画面について話すときの決まり（最も重要）:
- 「いま見えている画面」というテキストの一覧が随時届きます。読み手があなたの代わりに画面を精読したものです。画面の場所・ボタン・メニュー・操作手順について話すときは、最新の一覧に書かれている要素だけを使います。一覧に無いボタンやメニューを口にしてはいけません。あなたのアプリの知識は、一覧に見えているものを選ぶためにだけ使います。
- 一覧で足りないとき（表の数値や細かい文言を聞かれた、一覧に無いものを探している、一覧が古い）は look_closely を呼び、その結果に書かれている要素だけで答えます。
- look_closely を呼んでいる間のつなぎ（「確認しますね」）はシステムが言います。あなたは言いません。結果が来たら、前置きなしに答えます。正確さが最優先で、待たせてよいので、結果が来る前に答えを言い始めてはいけません。
- look_closely の結果が「見当たらない」なら、「この画面には見当たりません」と正直に言い、結果に挙がっている見えている要素の中から、次に開いてみる候補を1つだけ言います。
- ユーザーに「無い」「見つからない」と言われたものは、二度と案内しません。同じ案内を2回繰り返しません。行き詰まったら「分かりません」と言って、ユーザーに画面のどこを見ているか教えてもらいます。`;

/** The setup message body (`{"setup": <this>}`) for one connection. */
export function liveSetup(options: { voice: LiveVoice; handle?: string }) {
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
    systemInstruction: { role: "user", parts: [{ text: LIVE_SYSTEM_INSTRUCTION }] },
    tools: [
      {
        functionDeclarations: [
          {
            name: LOOK_CLOSELY,
            // The voice may keep talking while the read runs. In practice it
            // stays silent, which is why the client plays the bridge phrase.
            behavior: "NON_BLOCKING",
            description:
              "いまの画面の等倍の画像を精読し、見えている要素の一覧と、それだけを根拠にした答えを返す。画面の場所・ボタン・メニュー・操作手順について話す前に必ず呼ぶ。",
            parameters: {
              type: "OBJECT",
              properties: {
                question: {
                  type: "STRING",
                  description:
                    "ユーザーが知りたいこと、または確かめたいこと。会話の流れを含めて具体的に書く。",
                },
              },
              required: ["question"],
            },
          },
        ],
      },
    ],
    // Both transcripts: native-audio models have no text output modality, so
    // this is the only record of what was said and heard.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // The two walls of an hour-long session: the connection drops at ~10
    // minutes (resume with the handle), and an audio+video session ends at
    // 2 minutes without compression.
    sessionResumption: options.handle ? { handle: options.handle } : {},
    contextWindowCompression: { slidingWindow: {} },
    realtimeInputConfig: {
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
