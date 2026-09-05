import assert from "node:assert/strict";
import test from "node:test";

import { createTitleController } from "../title-controller.ts";

const NAMING_CONFIG = { enabled: true, model: "", thinking: "low", maxChars: 24 };

test("a native Pi name is preserved without the automatic title length limit", () => {
  const title = createTitleController({
    pi: {} as never,
    getNaming: () => NAMING_CONFIG,
    applyTitle: () => undefined,
  });

  assert.equal(title.observeSessionName("manual_name_that_is_deliberately_long"), "manual_name_that_is_deliberately_long");
  assert.equal(title.observeSessionName(undefined), undefined);
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
