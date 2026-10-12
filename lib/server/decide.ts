// Reflex experiment (app-mac companion build 37): one typed decision from a
// System One model (TypeSafe Jev via OpenRouter's decisions API). The client
// sends a `state` and up to a few typed `questions`; the model answers all of
// them in one round trip with probabilities. No text is generated here.
//
// The shape is OpenRouter's `POST /api/alpha/decisions`, which forwards the
// TypeSafe request body unchanged (docs.typesafe.ai: choice / score / noul).

export const DECIDE_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
export const DECIDE_TIMEOUT_MS = 8_000;
/** Jev rejects prompts over 32k tokens; Japanese runs close to a token per
 * character, so the state is capped well below that. */
export const MAX_STATE_CHARS = 30_000;
export const MAX_QUESTIONS = 8;
export const MAX_INSTRUCTION_CHARS = 2_000;
export const MAX_CHOICE_OPTIONS = 64;
export const MAX_SCORE_LEVELS = 10;
export const MAX_CRITERION_CHARS = 400;
const QUESTION_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const OPTION_KEY = /^[A-Za-z0-9_:.-]{1,64}$/;

export type DecideQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string };

export type DecideInput = {
  state: string;
  questions: Record<string, DecideQuestion>;
};

export type DecideAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number>; legend?: unknown }
  | { type: "noul"; noul: number };

export type DecideResult = {
  model: string;
  answers: Record<string, DecideAnswer>;
  input_tokens: number;
  output_tokens: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/** The validated input, or the reason it is not one. Unknown fields are
 * dropped rather than forwarded. */
export function parseDecideInput(raw: unknown): DecideInput | { error: string } {
  if (!isObject(raw)) return { error: "input must be an object." };
  if (typeof raw.state !== "string" || !raw.state.trim()) return { error: "input.state is required." };
  if (raw.state.length > MAX_STATE_CHARS) return { error: "input.state is too long." };
  if (!isObject(raw.questions)) return { error: "input.questions must be an object." };
  const names = Object.keys(raw.questions);
  if (names.length === 0 || names.length > MAX_QUESTIONS) {
    return { error: `input.questions must have 1 to ${MAX_QUESTIONS} entries.` };
  }
  const questions: Record<string, DecideQuestion> = {};
  for (const name of names) {
    if (!QUESTION_KEY.test(name)) return { error: `question name '${name}' is invalid.` };
    const q = raw.questions[name];
    if (!isObject(q)) return { error: `question '${name}' must be an object.` };
    const instructions = text(q.instructions, MAX_INSTRUCTION_CHARS);
    if (!instructions) return { error: `question '${name}' needs instructions.` };
    if (q.type === "noul") {
      questions[name] = { type: "noul", instructions };
    } else if (q.type === "choice") {
      if (!isObject(q.criteria)) return { error: `question '${name}' needs choice criteria.` };
      const keys = Object.keys(q.criteria);
      if (keys.length < 2 || keys.length > MAX_CHOICE_OPTIONS) {
        return { error: `question '${name}' needs 2 to ${MAX_CHOICE_OPTIONS} options.` };
      }
      const criteria: Record<string, string> = {};
      for (const key of keys) {
        const description = text(q.criteria[key], MAX_CRITERION_CHARS);
        if (!OPTION_KEY.test(key) || !description) return { error: `question '${name}' option '${key}' is invalid.` };
        criteria[key] = description;
      }
      questions[name] = { type: "choice", instructions, criteria };
    } else if (q.type === "score") {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > MAX_SCORE_LEVELS) {
        return { error: `question '${name}' needs 2 to ${MAX_SCORE_LEVELS} score levels.` };
      }
      const criteria: string[] = [];
      for (const level of q.criteria) {
        const description = text(level, MAX_CRITERION_CHARS);
        if (!description) return { error: `question '${name}' has an invalid score level.` };
        criteria.push(description);
      }
      questions[name] = { type: "score", instructions, criteria };
    } else {
      return { error: `question '${name}' has an unknown type.` };
    }
  }
  return { state: raw.state, questions };
}

export function decideRequest(input: DecideInput, model: string) {
  return { model, state: input.state, questions: input.questions };
}

function probability(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function distribution(value: unknown, keys: string[] | null): Record<string, number> | null {
  if (!isObject(value)) return null;
  const entries = Object.entries(value);
  if (keys && (entries.length !== keys.length || entries.some(([k]) => !keys.includes(k)))) return null;
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [k, v] of entries) {
    const p = probability(v);
    if (p === null) return null;
    out[k] = p;
    sum += p;
  }
  if (entries.length === 0 || Math.abs(sum - 1) > 0.02) return null;
  return out;
}

/** The provider's answers, checked against the questions that were asked.
 * Throws on anything that does not match: a decision the code acts on must
 * have exactly the shape it asked for. */
export function decodeDecide(raw: unknown, input: DecideInput): DecideResult {
  if (!isObject(raw) || typeof raw.model !== "string" || !raw.model) throw new Error("decide: model missing");
  if (!isObject(raw.answers)) throw new Error("decide: answers missing");
  const usage = isObject(raw.usage) ? raw.usage : {};
  const tokens = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
  const answers: Record<string, DecideAnswer> = {};
  for (const [name, question] of Object.entries(input.questions)) {
    const a = raw.answers[name];
    if (!isObject(a) || a.type !== question.type) throw new Error(`decide: answer '${name}' missing`);
    if (question.type === "noul") {
      const noul = probability(a.noul);
      if (noul === null) throw new Error(`decide: answer '${name}' invalid`);
      answers[name] = { type: "noul", noul };
    } else if (question.type === "choice") {
      const keys = Object.keys(question.criteria);
      const probabilities = distribution(a.probabilities, keys);
      const confidence = probability(a.confidence);
      if (!probabilities || confidence === null || typeof a.choice !== "string" || !keys.includes(a.choice)) {
        throw new Error(`decide: answer '${name}' invalid`);
      }
      const top = Math.max(...Object.values(probabilities));
      if (probabilities[a.choice] < top - 1e-6) throw new Error(`decide: answer '${name}' choice is not the maximum`);
      answers[name] = { type: "choice", choice: a.choice, confidence, probabilities };
    } else {
      const probabilities = distribution(a.probabilities, null);
      const confidence = probability(a.confidence);
      if (!probabilities || confidence === null || typeof a.score !== "number" || !Number.isFinite(a.score)) {
        throw new Error(`decide: answer '${name}' invalid`);
      }
      answers[name] = { type: "score", score: a.score, confidence, probabilities, legend: a.legend };
    }
  }
  return { model: raw.model, answers, input_tokens: tokens(usage.input_tokens), output_tokens: tokens(usage.output_tokens) };
}

/** One round trip. No retries: a reflex that is late is a reflex that is
 * useless, and the caller decides what to do without it. Never includes the
 * key or the upstream body in an error. */
export async function runDecide(
  input: DecideInput,
  key: string,
  model: string,
  signal: AbortSignal,
): Promise<DecideResult & { provider_ms: number }> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(DECIDE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(decideRequest(input, model)),
      signal: AbortSignal.any([signal, AbortSignal.timeout(DECIDE_TIMEOUT_MS)]),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`decide: no answer within ${DECIDE_TIMEOUT_MS}ms`);
    }
    throw new Error("decide: request failed to reach the provider");
  }
  if (!response.ok) throw new Error(`decide: HTTP ${response.status}`);
  const result = decodeDecide(await response.json().catch(() => null), input);
  return { ...result, provider_ms: Math.round(performance.now() - started) };
}
