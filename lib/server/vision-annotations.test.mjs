import assert from "node:assert/strict";
import test from "node:test";

import { buildVisionPromptText } from "./vision-prompt.ts";

const BASE = { turns: [], candidates: [] };

// The whole point of the flag is that a client which cannot draw is not asked
// to pay for coordinates, and — more importantly — that the shipped macOS
// client's prompt is not quietly rewritten underneath it. If this ever fails,
// a native release is getting a prompt it was never tested against.
test("no drawing instructions reach a client that did not ask", () => {
  const prompt = buildVisionPromptText(BASE);
  assert.ok(!prompt.includes("Drawing on this screenshot"));
  assert.ok(!prompt.includes("annotation"));
});

test("drawing instructions appear only when annotations are wanted", () => {
  const prompt = buildVisionPromptText({ ...BASE, wantsAnnotations: true });
  assert.ok(prompt.includes("Drawing on this screenshot"));
  // Refusing to guess is the instruction that matters: a box over the wrong
  // control sends somebody who cannot read the screen to the wrong place.
  assert.ok(prompt.includes("prefer returning no annotation"));
});

test("a tap resolves the turn's intent to the thing under it", () => {
  const prompt = buildVisionPromptText({
    ...BASE,
    pointer: { kind: "point", point: { x: 0.5, y: 0.25 } },
  });
  assert.ok(prompt.includes("Where the user pointed"));
  assert.ok(prompt.includes("The user tapped this spot"));
  assert.ok(prompt.includes("do not know the name of"));
  // The mark has to outrank the numbers, and the model must not narrate it:
  // the ring is the user's gesture, not something on the screen they asked about.
  assert.ok(prompt.includes("magenta mark"));
  assert.ok(prompt.includes("trust it over the coordinates"));
  assert.ok(prompt.includes("never describe or mention it"));
});

// A ring means "all of this", and answering about one element inside it is the
// specific failure worth pinning: it is what a model does by default when it
// finds something nameable in the area.
test("a ring is treated as one area rather than one element", () => {
  const prompt = buildVisionPromptText({
    ...BASE,
    pointer: { kind: "region", region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } },
  });
  assert.ok(prompt.includes("drew a ring"));
  assert.ok(prompt.includes("as a whole rather than picking one element"));
});

// A question is a more specific statement of what the user wants than the
// gesture that accompanied it, so the question keeps the intent slot and the
// pointer narrows where to look.
test("a question outranks a pointer for intent, and the pointer still lands", () => {
  const prompt = buildVisionPromptText({
    ...BASE,
    question: "これは何ですか",
    pointer: { kind: "point", point: { x: 0.5, y: 0.5 } },
  });
  assert.ok(prompt.includes("Latest question: これは何ですか"));
  assert.ok(prompt.includes("Where the user pointed"));
  assert.ok(!prompt.includes("without asking anything in words"));
});

test("a pointerless request is unchanged", () => {
  const prompt = buildVisionPromptText(BASE);
  assert.ok(!prompt.includes("Where the user pointed"));
});
