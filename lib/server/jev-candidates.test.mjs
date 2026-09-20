import assert from "node:assert/strict";
import { test } from "node:test";
import { jevInputSchema, jevRequest, decodeJev, runJev } from "./jev-candidates.ts";

const input = {
  snapshot_id: "80affec2-797e-477d-8d80-f79b12f996ad", goal: "期間を延長する",
  previous_instruction: "日付メニューを開く", turns: [],
  candidates: [
    {id: "ax:1", label: "過去7日間", states: [], role: "menuitem"},
    {id: "ax:2", label: "過去90日間", states: [], role: "menuitem"},
  ],
};
const answer = () => ({model: "jev-test", answers: {next_target: {
  type: "choice", choice: "none", confidence: 0.7,
  probabilities: {"ax:1": 0.05, "ax:2": 0.05, none: 0.9},
}}, usage: {input_tokens: 123, output_tokens: 20}});

test("preserves goal and supports abstention instead of forcing an available but unrelated date preset", () => {
  const payload = jevRequest(jevInputSchema.parse(input), "jev-test");
  assert.equal(JSON.parse(payload.state).goal, input.goal);
  assert.deepEqual(Object.keys(payload.questions.next_target.criteria), ["ax:1", "ax:2", "none"]);
  assert.equal(decodeJev(answer(), input).choice, "none");
});

test("rejects duplicate ids, unsupported source fields, oversized sets and screenshots", () => {
  assert.equal(jevInputSchema.safeParse({...input, candidates: [input.candidates[0], input.candidates[0]]}).success, false);
  assert.equal(jevInputSchema.safeParse({...input, image_base64: "forbidden"}).success, false);
  assert.equal(jevInputSchema.safeParse({...input, candidates: [{...input.candidates[0], rect: {x: 1}}]}).success, false);
  const candidates = Array.from({length: 255}, (_, i) => ({id: `ax:${i}`, label: "test", states: []}));
  assert.equal(jevInputSchema.safeParse({...input, candidates}).success, false);
  assert.equal(jevInputSchema.safeParse({...input, candidates: candidates.slice(0, 254)}).success, true);
});

test("rejects unknown/missing ids, invalid sums, nonfinite probabilities and a choice below the maximum", () => {
  for (const patch of [
    {choice: "ax:999"},
    {probabilities: {"ax:1": 0.1, "ax:2": 0.1, "ax:999": 0.8}},
    {probabilities: {"ax:1": 0.1, none: 0.9}},
    {probabilities: {"ax:1": 0.1, "ax:2": 0.1, none: 0.1}},
    {probabilities: {"ax:1": NaN, "ax:2": 0.1, none: 0.9}},
    {confidence: 1.1}, {choice: "ax:1"},
  ]) {
    const raw = answer(); Object.assign(raw.answers.next_target, patch);
    assert.throws(() => decodeJev(raw, input));
  }
});

test("upstream failure exposes no body, does not retry, and passes cancellation to transport", async t => {
  let calls = 0;
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, "Bearer dummy-unit-test-key");
    assert.equal(JSON.parse(options.body).model, "jev-test");
    assert.equal(options.signal.aborted, true);
    return new Response("sensitive upstream content", {status: 429});
  });
  controller.abort();
  await assert.rejects(runJev(input, "dummy-unit-test-key", "jev-test", controller.signal), {message: "Jev HTTP 429"});
  assert.equal(calls, 1);
});
