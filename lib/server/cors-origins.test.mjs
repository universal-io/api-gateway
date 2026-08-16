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

// Vercel truncates the project name in per-deployment hostnames once it gets
// long, so "universal-io-app-web" becomes "universal-io-app". Those URLs are
// deliberately not matched: they are one deployment each, nobody opens the app
// through them, and loosening the prefix to admit them would also admit every
// other project in the account whose name starts the same way.
test("truncated per-deployment hostnames are not matched", () => {
  assert.ok(
    !PREVIEW_ORIGIN.test(
      "https://universal-io-app-756xn3vdj-kaya-matsumotos-projects.vercel.app",
    ),
  );
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
