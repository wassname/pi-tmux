import assert from "node:assert/strict";
import test from "node:test";

import { createTitleController } from "../core/title-controller.ts";

const NAMING_CONFIG = { enabled: true, model: "", thinking: "low", maxChars: 24 };

test("a native Pi name is preserved without the automatic title length limit", async () => {
  const applied: string[] = [];
  const title = createTitleController({
    pi: { getSessionName: () => "manual_name_that_is_deliberately_long" } as never,
    getNaming: () => ({ ...NAMING_CONFIG, enabled: false }),
    applyTitle: (value) => {
      applied.push(value);
      return value;
    },
  });

  assert.equal(title.observeSessionName("manual_name_that_is_deliberately_long"), "manual_name_that_is_deliberately_long");
  assert.equal(title.observeSessionName(undefined), undefined);
  assert.equal(await title.restoreExistingTitle({} as never), true);
  assert.deepEqual(applied, ["manual_name_that_is_deliberately_long"]);
});

test("a native Pi name cancels an in-flight automatic title", async () => {
  let resolveTitle!: (value: { content: { type: "text"; text: string }[] }) => void;
  const applied: string[] = [];
  const title = createTitleController({
    pi: { getSessionName: () => undefined } as never,
    getNaming: () => NAMING_CONFIG,
    applyTitle: (value) => {
      applied.push(value);
      return value;
    },
  });
  const ctx = {
    model: { provider: "test", id: "test", api: "test" },
    modelRegistry: {
      find: () => undefined,
      getApiKeyAndHeaders: async () => ({ ok: true }),
      getRegisteredProviderConfig: () => ({
        streamSimple: () => ({
          result: () => new Promise((resolve) => {
            resolveTitle = resolve;
          }),
        }),
      }),
    },
  } as never;

  const automatic = title.applyAutoTitle("name this", ctx);
  await new Promise((resolve) => setImmediate(resolve));
  title.observeSessionName("manual_name");
  resolveTitle({ content: [{ type: "text", text: "TITLE: automatic_name" }] });
  await automatic;

  assert.deepEqual(applied, []);
});
