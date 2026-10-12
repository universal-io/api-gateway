import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDecideInput, decideRequest, decodeDecide, runDecide } from "./decide.ts";

const input = {
  state: JSON.stringify({ app_in_front: "Xcode", user_said: "右上のメニューって何なんでしょう" }),
  questions: {
    kind: { type: "choice", instructions: "Classify the user's words.",
      criteria: { screen: "Needs the screen.", conversation: "Needs no screen.", unclear: "Fragment or noise." } },
    about_screen: { type: "noul", instructions: "The user refers to something on screen." },
    difficulty: { type: "score", instructions: "How hard is the question?", criteria: ["easy", "medium", "hard"] },
  },
};
const answer = () => ({
  model: "typesafe/jev-test", usage: { input_tokens: 120, output_tokens: 9 },
  answers: {
    kind: { type: "choice", choice: "screen", confidence: 0.9, probabilities: { screen: 0.93, conversation: 0.05, unclear: 0.02 } },
    about_screen: { type: "noul", noul: 0.88 },
    difficulty: { type: "score", score: 1, confidence: 0.6, probabilities: { easy: 0.7, medium: 0.2, hard: 0.1 }, legend: ["easy", "medium", "hard"] },
  },
});

test("accepts the three question types, forwards only known fields, and keeps the state verbatim", () => {
  const parsed = parseDecideInput({ ...input, questions: { ...input.questions, kind: { ...input.questions.kind, extra: 1 } }, junk: true });
  assert.ok(!("error" in parsed));
  const payload = decideRequest(parsed, "jev-test");
  assert.equal(payload.model, "jev-test");
  assert.equal(payload.state, input.state);
  assert.deepEqual(Object.keys(payload.questions), ["kind", "about_screen", "difficulty"]);
  assert.equal("extra" in payload.questions.kind, false);
});

test("rejects empty or oversized states, bad names, too few options, and unknown types", () => {
  const bad = (patch) => "error" in parseDecideInput({ ...input, ...patch });
  assert.ok(bad({ state: "" }));
  assert.ok(bad({ state: "x".repeat(30_001) }));
  assert.ok(bad({ questions: {} }));
  assert.ok(bad({ questions: { "Bad Name": input.questions.kind } }));
  assert.ok(bad({ questions: { kind: { type: "choice", instructions: "x", criteria: { only: "one" } } } }));
  assert.ok(bad({ questions: { kind: { type: "guess", instructions: "x" } } }));
  assert.ok(bad({ questions: { kind: { type: "choice", instructions: "", criteria: input.questions.kind.criteria } } }));
});

test("decodes a matching answer set and reports tokens", () => {
  const parsed = parseDecideInput(input);
  const result = decodeDecide(answer(), parsed);
  assert.equal(result.answers.kind.choice, "screen");
  assert.equal(result.answers.about_screen.noul, 0.88);
  assert.equal(result.answers.difficulty.score, 1);
  assert.equal(result.input_tokens, 120);
});

test("rejects answers whose shape differs from the question asked", () => {
  const parsed = parseDecideInput(input);
  for (const patch of [
    (a) => { a.answers.kind.choice = "elsewhere"; },
    (a) => { a.answers.kind.probabilities = { screen: 0.5, conversation: 0.5 }; },
    (a) => { a.answers.kind.probabilities = { screen: 0.2, conversation: 0.2, unclear: 0.2 }; },
    (a) => { a.answers.kind.choice = "unclear"; },
    (a) => { a.answers.kind.confidence = 1.5; },
    (a) => { a.answers.about_screen.noul = -0.1; },
    (a) => { a.answers.about_screen.type = "choice"; },
    (a) => { delete a.answers.difficulty; },
    (a) => { a.answers.difficulty.score = "high"; },
  ]) {
    const raw = answer();
    patch(raw);
    assert.throws(() => decodeDecide(raw, parsed));
  }
});

test("upstream failure exposes no body, does not retry, and passes cancellation to transport", async (t) => {
  let calls = 0;
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, "Bearer dummy-unit-test-key");
    assert.equal(JSON.parse(options.body).model, "jev-test");
    assert.equal(options.signal.aborted, true);
    return new Response("sensitive upstream content", { status: 429 });
  });
  controller.abort();
  const parsed = parseDecideInput(input);
  await assert.rejects(runDecide(parsed, "dummy-unit-test-key", "jev-test", controller.signal), { message: "decide: HTTP 429" });
  assert.equal(calls, 1);
});
