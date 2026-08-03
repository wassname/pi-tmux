import assert from "node:assert/strict";
import test from "node:test";

import { compactTitle, normalizeThinkingLevel, parseGeneratedTitle, sanitizeTitle } from "../naming.ts";

test("a TITLE line is unwrapped", () => {
  assert.equal(parseGeneratedTitle("TITLE: Fix OAuth callback").title, "Fix OAuth callback");
});

test("a bare single line is treated as the title", () => {
  assert.equal(parseGeneratedTitle("OAuthコールバック修正").title, "OAuthコールバック修正");
});

test("sanitizeTitle drops newlines, control characters, and surrounding quotes", () => {
  assert.equal(sanitizeTitle('  "ログイン\n処理の\t修正"  '), "ログイン 処理の 修正");
});

test("a title within the limit is kept as is", () => {
  assert.equal(compactTitle("OAuth認証の修正"), "OAuth認証の修正");
});

test("a title over the limit is truncated", () => {
  assert.equal(compactTitle("あ".repeat(40)), "あ".repeat(32));
  assert.equal(compactTitle("あ".repeat(40), 20), "あ".repeat(20));
});

test("a title that sanitizes to nothing is undefined", () => {
  assert.equal(compactTitle('  "" \n '), undefined);
});

test("only known thinking levels are passed through", () => {
  assert.equal(normalizeThinkingLevel("low"), "low");
  assert.equal(normalizeThinkingLevel("LOW"), "low");
  assert.equal(normalizeThinkingLevel("off"), undefined);
  assert.equal(normalizeThinkingLevel("nonsense"), undefined);
});
