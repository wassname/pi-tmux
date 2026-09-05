import assert from "node:assert/strict";
import test from "node:test";

import { createCompletionAlert, type AlertRuntime } from "../core/completion-alert.ts";

function createFakeRuntime(initialName: string, visible: boolean, appFocused = true) {
  let name = initialName;
  let targetVisible = visible;
  let focused = appFocused;

  const runtime: AlertRuntime & {
    readonly name: string;
    setVisible(value: boolean): void;
    setAppFocused(value: boolean): void;
  } = {
    get name() {
      return name;
    },
    setVisible(value: boolean) {
      targetVisible = value;
    },
    setAppFocused(value: boolean) {
      focused = value;
    },
    async getName() {
      return name;
    },
    async setName(_targetId, next) {
      name = next;
      return true;
    },
    async isTargetVisible() {
      return targetVisible;
    },
    async isAppFocused() {
      return focused;
    },
  };

  return runtime;
}

test("hidden target is marked and the bell rings when the agent finishes", async () => {
  const runtime = createFakeRuntime("Fix oauth callback", false);
  let bellCount = 0;
  let soundCount = 0;

  const alert = createCompletionAlert(runtime, {
    enabled: true,
    bellEnabled: true,
    directSoundEnabled: true,
    mark: "🔔",
    ringBell: () => {
      bellCount += 1;
    },
    playDirectSound: () => {
      soundCount += 1;
    },
  });

  await alert.notifyAgentEnd("@1");

  assert.equal(bellCount, 1);
  assert.equal(soundCount, 1);
  assert.equal(runtime.name, "🔔 Fix oauth callback");
});

test("hidden target clears its mark once it becomes visible", async () => {
  const runtime = createFakeRuntime("Fix oauth callback", false);
  let watchCallback: (() => Promise<boolean>) | undefined;

  const alert = createCompletionAlert(runtime, {
    enabled: true,
    bellEnabled: false,
    mark: "🔔",
    ringBell: () => {},
    watchMarkedTarget: (callback) => {
      watchCallback = callback;
    },
  });

  await alert.notifyAgentEnd("@1");
  assert.equal(runtime.name, "🔔 Fix oauth callback");

  runtime.setVisible(true);
  await watchCallback?.();

  assert.equal(runtime.name, "Fix oauth callback");
});

test("hidden target in an unfocused app is marked without the direct sound", async () => {
  const runtime = createFakeRuntime("Fix oauth callback", false, false);
  let soundCount = 0;

  const alert = createCompletionAlert(runtime, {
    enabled: true,
    bellEnabled: false,
    directSoundEnabled: true,
    mark: "🔔",
    ringBell: () => {},
    playDirectSound: () => {
      soundCount += 1;
    },
  });

  await alert.notifyAgentEnd("@1");

  assert.equal(soundCount, 0);
  assert.equal(runtime.name, "🔔 Fix oauth callback");
});

test("visible target in a focused app is marked then auto-cleared", async () => {
  const runtime = createFakeRuntime("Fix oauth callback", true, true);
  let scheduledDelay = 0;
  let scheduledClear: (() => Promise<void>) | undefined;

  const alert = createCompletionAlert(runtime, {
    enabled: true,
    bellEnabled: false,
    focusedMarkAutoClearMs: 5000,
    mark: "🔔",
    ringBell: () => {},
    scheduleAutoClear: (callback, delayMs) => {
      scheduledClear = callback;
      scheduledDelay = delayMs;
    },
  });

  await alert.notifyAgentEnd("@1");

  assert.equal(scheduledDelay, 5000);
  assert.equal(runtime.name, "🔔 Fix oauth callback");

  await scheduledClear?.();
  assert.equal(runtime.name, "Fix oauth callback");
});

test("visible target in an unfocused app waits for app focus before auto-clear", async () => {
  const runtime = createFakeRuntime("Fix oauth callback", true, false);
  let scheduledCount = 0;
  let watchCallback: (() => Promise<boolean>) | undefined;
  let scheduledClear: (() => Promise<void>) | undefined;

  const alert = createCompletionAlert(runtime, {
    enabled: true,
    bellEnabled: false,
    focusedMarkAutoClearMs: 5000,
    mark: "🔔",
    ringBell: () => {},
    scheduleAutoClear: (callback) => {
      scheduledCount += 1;
      scheduledClear = callback;
    },
    watchMarkedTarget: (callback) => {
      watchCallback = callback;
    },
  });

  await alert.notifyAgentEnd("@1");

  assert.equal(scheduledCount, 0);
  assert.equal(runtime.name, "🔔 Fix oauth callback");

  runtime.setAppFocused(true);
  assert.equal(await watchCallback?.(), true);
  assert.equal(scheduledCount, 1);

  await scheduledClear?.();
  assert.equal(runtime.name, "Fix oauth callback");
});
