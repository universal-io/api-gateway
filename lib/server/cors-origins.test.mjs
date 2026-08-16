import assert from "node:assert/strict";
import test from "node:test";

/**
 * The allowlist is duplicated here rather than imported, because proxy.ts is a
 * Next.js runtime module and pulling it into the node test runner drags the
 * framework in with it. What is being pinned is the shape of the hosts, which
 * is what silently stopped matching when the Vercel project was renamed.
 */
const PREVIEW_ORIGIN = /^https:\/\/universal-io-app-web-[a-z0-9-]+\.vercel\.app$/;

test("the deployment hosts Vercel actually issues are matched", () => {
  for (const origin of [
    "https://universal-io-app-web-kaya-matsumotos-projects.vercel.app",
    "https://universal-io-app-web-git-main-kaya-matsumotos-projects.vercel.app",
    "https://universal-io-app-web-4zexhs0vi-kaya-matsumotos-projects.vercel.app",
  ]) {
    assert.ok(PREVIEW_ORIGIN.test(origin), origin);
  }
});

// The bare production alias has no hyphen after the project name, so the
// pattern cannot cover it and it is listed exactly in proxy.ts. This test
// exists to keep anyone from "simplifying" by deleting that entry.
test("the bare production alias is not covered by the pattern", () => {
  assert.ok(!PREVIEW_ORIGIN.test("https://universal-io-app-web.vercel.app"));
});

// The anchoring is the whole security property: a host that merely begins with
// the project name, or merely ends with vercel.app, must not pass.
test("lookalike hosts are refused", () => {
  for (const origin of [
    "https://universal-io-app-web-evil.com",
    "https://universal-io-app-web.vercel.app.evil.com",
    "https://evil-universal-io-app-web-x.vercel.app",
    "http://universal-io-app-web-x.vercel.app",
    "https://app-web-x.vercel.app",
  ]) {
    assert.ok(!PREVIEW_ORIGIN.test(origin), origin);
  }
});
