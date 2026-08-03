import assert from "node:assert/strict";
import test from "node:test";

import {
  createTerminalTitleRuntime,
  getTerminalTitle,
  ringTerminalBell,
  stripTitleSuffix,
} from "../osc-title.ts";

function captureStdoutWrite(isTTY: boolean, run: () => void): string {
  let written = "";
  const originalWrite = process.stdout.write;
  const originalIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

  process.stdout.write = ((chunk: string | Uint8Array) => {
    written += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: isTTY });

  try {
    run();
    return written;
  } finally {
    process.stdout.write = originalWrite;
    if (originalIsTTYDescriptor) {
      Object.defineProperty(process.stdout, "isTTY", originalIsTTYDescriptor);
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }
  }
}

test("the bell is written to a TTY stdout", () => {
  assert.equal(captureStdoutWrite(true, () => ringTerminalBell()), "\x07");
});

test("the bell is not written to a non-TTY stdout", () => {
  assert.equal(captureStdoutWrite(false, () => ringTerminalBell()), "");
});

test("the terminal title runtime remembers the current title", () => {
  const runtime = createTerminalTitleRuntime("OAuth認証の修正");
  assert.equal(runtime.getTitle(), "OAuth認証の修正");

  const written = captureStdoutWrite(true, () => {
    assert.equal(runtime.setTitle("- OAuth認証の修正"), true);
  });

  assert.equal(written, "\x1b]2;- OAuth認証の修正\x07");
  assert.equal(runtime.getTitle(), "- OAuth認証の修正");
  assert.equal(getTerminalTitle(), "- OAuth認証の修正");
});

test("a trailing directory suffix is stripped from BEL-terminated OSC 0 titles", () => {
  assert.equal(
    stripTitleSuffix("\x1b]0;π - OAuth認証の修正 - .pi\x07", " - .pi"),
    "\x1b]0;π - OAuth認証の修正\x07",
  );
});

test("a trailing directory suffix is stripped from ST-terminated OSC 0 titles", () => {
  assert.equal(stripTitleSuffix("\x1b]0;π - .pi\x1b\\", " - .pi"), "\x1b]0;π\x1b\\");
});

test("a title without the suffix is left alone", () => {
  const data = "\x1b]0;π - OAuth認証の修正\x07";
  assert.equal(stripTitleSuffix(data, " - .pi"), data);
});

test("non-title stdout passes through untouched", () => {
  const data = "plain log line - .pi\n";
  assert.equal(stripTitleSuffix(data, " - .pi"), data);
});
