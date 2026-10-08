import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIVE_VOICE,
  LIVE_NEW_SESSION_WINDOW_MS,
  LIVE_SYSTEM_INSTRUCTION,
  LIVE_TOKEN_LIFETIME_MS,
  LOOK_CLOSELY,
  liveSetup,
  liveTokenRequestBody,
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

test("a new session asks for a handle; a resume carries the one it was given", () => {
  // The handle is part of the locked setup, so a reconnect cannot reuse the
  // first token: it needs a new one minted with the handle inside.
  assert.deepEqual(liveSetup({ voice: "Kore" }).sessionResumption, {});
  assert.deepEqual(liveSetup({ voice: "Kore", handle: "h-1" }).sessionResumption, { handle: "h-1" });
});

test("both walls of a long session are configured from the first connection", () => {
  const setup = liveSetup({ voice: "Kore" });
  assert.deepEqual(setup.contextWindowCompression, { slidingWindow: {} });
  assert.deepEqual(setup.inputAudioTranscription, {});
  assert.deepEqual(setup.outputAudioTranscription, {});
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
