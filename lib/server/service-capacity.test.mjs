import assert from "node:assert/strict";
import test from "node:test";

import {
  serviceCapacityExhausted,
  serviceCeilingApplies,
} from "./service-capacity.ts";

test("the service ceiling refuses only the free plan", () => {
  assert.equal(serviceCeilingApplies("free"), true);
  for (const plan of ["standard", "pro", "team", "enterprise"]) {
    assert.equal(serviceCeilingApplies(plan), false, plan);
  }
});

test("a plan the catalog gains later is not refused by default", () => {
  // bs_plans is edited without deploying, so an unrecognised plan reaching
  // this code means someone sold something new — not that they should be cut
  // off by a budget they are not spending from.
  assert.equal(serviceCeilingApplies("scale"), false);
});

test("the month is spent at the ceiling, not one request past it", () => {
  assert.equal(serviceCapacityExhausted({ used: 4_999, limit: 5_000 }), false);
  assert.equal(serviceCapacityExhausted({ used: 5_000, limit: 5_000 }), true);
  assert.equal(serviceCapacityExhausted({ used: 5_001, limit: 5_000 }), true);
});

test("a ceiling that is absent or unread never refuses anyone", () => {
  // Both of these are "we do not know", and the answer to not knowing is to
  // keep serving: the spend is bounded by a number an operator chose, while
  // the users a false positive locks out are not.
  assert.equal(serviceCapacityExhausted({ used: 9_999, limit: null }), false);
  assert.equal(serviceCapacityExhausted({ used: null, limit: 5_000 }), false);
});

test("a ceiling of zero closes free usage completely", () => {
  // The one case where the availability posture yields: zero is a number
  // somebody typed, not a gap in the config.
  assert.equal(serviceCapacityExhausted({ used: 0, limit: 0 }), true);
});
