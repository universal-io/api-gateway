import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIVE_TURNS,
  DEFAULT_LIVE_VOICE,
  LIVE_NEW_SESSION_WINDOW_MS,
  LIVE_SYSTEM_INSTRUCTION,
  LIVE_TOKEN_LIFETIME_MS,
  LOOK_CLOSELY,
  liveSetup,
  liveTokenRequestBody,
  parseLiveTurns,
  parseLiveVoice,
} from "./live-session.ts";
import { LIVE_MODEL } from "./ai-routing.ts";

test("the setup names the routed model, the voice and the one tool", () => {
  const setup = liveSetup({ voice: "Zephyr" });
  assert.equal(setup.model, `models/${LIVE_MODEL.modelId}`);
  assert.deepEqual(setup.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Zephyr");
  const declarations = setup.tools[0].functionDeclarations;
  assert.deepEqual(declarations.map((declaration) => declaration.name), [LOOK_CLOSELY]);
  assert.equal(declarations[0].behavior, "NON_BLOCKING");
  assert.equal(setup.systemInstruction.parts[0].text, LIVE_SYSTEM_INSTRUCTION);
});

test("look_closely takes the question, the goal and two flags, and requires only the question", () => {
  const [declaration] = liveSetup({ voice: "Kore" }).tools[0].functionDeclarations;
  const types = Object.fromEntries(
    Object.entries(declaration.parameters.properties).map(([name, property]) => [name, property.type]),
  );
  assert.deepEqual(types, {
    question: "STRING",
    goal: "STRING",
    next_step: "BOOLEAN",
    points_at_cursor: "BOOLEAN",
  });
  assert.deepEqual(declaration.parameters.required, ["question"]);
});

test("the persona tells the model how to fill every parameter the tool declares", () => {
  // The persona refers to the tool and its parameters by name, so renaming
  // one on either side alone would leave the model filling a parameter that
  // no longer exists.
  const [declaration] = liveSetup({ voice: "Kore" }).tools[0].functionDeclarations;
  assert.ok(LIVE_SYSTEM_INSTRUCTION.includes(LOOK_CLOSELY));
  for (const name of Object.keys(declaration.parameters.properties)) {
    assert.ok(LIVE_SYSTEM_INSTRUCTION.includes(name), `the persona never mentions ${name}`);
  }
});

test("a new session asks for a handle; a resume carries the one it was given", () => {
  // The handle is part of the locked setup, so a reconnect cannot reuse the
  // first token: it needs a new one minted with the handle inside.
  assert.deepEqual(liveSetup({ voice: "Kore" }).sessionResumption, {});
  assert.deepEqual(liveSetup({ voice: "Kore", handle: "h-1" }).sessionResumption, { handle: "h-1" });
});

test("both walls of a long session are configured from the first connection", () => {
  const setup = liveSetup({ voice: "Kore" });
  // Compression starts at 25k tokens. The default waits until ~100k, and
  // every turn is billed for the whole context until then.
  assert.deepEqual(setup.contextWindowCompression, {
    triggerTokens: 25000,
    slidingWindow: { targetTokens: 8000 },
  });
  assert.deepEqual(setup.outputAudioTranscription, {});
});

test("the user's speech is transcribed as Japanese whoever marks the turns", () => {
  // Automatic language detection produced non-Japanese fragments.
  for (const turns of [undefined, "server", "client"]) {
    assert.deepEqual(liveSetup({ voice: "Kore", turns }).inputAudioTranscription, {
      languageCodes: ["ja-JP"],
    });
  }
});

test("without a turns choice the server detects speech, tuned as build 19 expects", () => {
  // Build 19 sends no turns, so its sessions must keep exactly this detection.
  const tuned = {
    automaticActivityDetection: {
      startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
      endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
      prefixPaddingMs: 300,
      silenceDurationMs: 600,
    },
  };
  assert.equal(DEFAULT_LIVE_TURNS, "server");
  assert.deepEqual(liveSetup({ voice: "Kore" }).realtimeInputConfig, tuned);
  assert.deepEqual(liveSetup({ voice: "Kore", turns: "server" }).realtimeInputConfig, tuned);
});

test("client turns switch the server's detection off and change nothing else", () => {
  // The client sends activityStart/activityEnd around each utterance instead.
  const server = liveSetup({ voice: "Puck", handle: "h-3", turns: "server" });
  const client = liveSetup({ voice: "Puck", handle: "h-3", turns: "client" });
  assert.deepEqual(client.realtimeInputConfig, { automaticActivityDetection: { disabled: true } });
  assert.deepEqual(
    { ...client, realtimeInputConfig: null },
    { ...server, realtimeInputConfig: null },
  );
});

test("the token locks the exact setup the client will send, and opens only once", () => {
  const setup = liveSetup({ voice: "Leda", handle: "h-2" });
  const now = Date.UTC(2026, 9, 8, 12, 0, 0);
  const body = liveTokenRequestBody(setup, now);
  assert.equal(body.uses, 1);
  assert.equal(body.bidiGenerateContentSetup, setup);
  assert.equal(body.expireTime, new Date(now + LIVE_TOKEN_LIFETIME_MS).toISOString());
  assert.equal(body.newSessionExpireTime, new Date(now + LIVE_NEW_SESSION_WINDOW_MS).toISOString());
  // No fieldMask: the whole setup is locked, so the client cannot swap the
  // persona or the model even though it sends the setup itself.
  assert.equal("fieldMask" in body, false);
});

test("the persona greets by the app in front, and only after being told to start", () => {
  assert.match(LIVE_SYSTEM_INSTRUCTION, /いま前面にあるアプリ/);
  assert.match(LIVE_SYSTEM_INSTRUCTION, /（開始）/);
});

test("voices are a closed list with a default", () => {
  assert.equal(parseLiveVoice(undefined), DEFAULT_LIVE_VOICE);
  assert.equal(parseLiveVoice("Zephyr"), "Zephyr");
  assert.equal(parseLiveVoice("zephyr"), null);
  assert.equal(parseLiveVoice(3), null);
});

test("turns are server or client, and server when not given", () => {
  assert.equal(parseLiveTurns(undefined), "server");
  assert.equal(parseLiveTurns("server"), "server");
  assert.equal(parseLiveTurns("client"), "client");
  assert.equal(parseLiveTurns("Client"), null);
  assert.equal(parseLiveTurns(null), null);
  assert.equal(parseLiveTurns(true), null);
});
