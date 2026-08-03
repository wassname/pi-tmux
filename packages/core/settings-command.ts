import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { notify } from "./title-controller.ts";

export type SettingSpec =
  | {
      key: string;
      type: "boolean";
      get(): boolean;
      set(value: boolean): void;
    }
  | {
      key: string;
      type: "enum";
      values: string[];
      describe?(value: string): string;
      get(): string;
      set(value: string): void;
    }
  | {
      key: string;
      type: "string";
      get(): string;
      set(value: string): void;
    }
  | {
      key: string;
      type: "number";
      get(): number;
      set(value: number): void;
    };

export type SettingsCommandOptions = {
  name: string;
  specs: SettingSpec[];
  onChange?: (key: string, ctx: ExtensionCommandContext) => Promise<void> | void;
  save: () => void;
};

function formatValue(spec: SettingSpec): string {
  const value = spec.get();
  if (spec.type === "boolean") return value ? "on" : "off";
  return String(value);
}

function parseBoolean(value: string): boolean | undefined {
  if (["on", "true", "enable", "enabled", "yes", "1"].includes(value)) return true;
  if (["off", "false", "disable", "disabled", "no", "0"].includes(value)) return false;
  return undefined;
}

export function createSettingsCommand(options: SettingsCommandOptions) {
  const specs = new Map(options.specs.map((spec) => [spec.key, spec]));

  return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const key = parts[0];

    if (!key) {
      const lines = options.specs.map((spec) => `  ${spec.key.padEnd(16)} ${formatValue(spec)}`);
      notify(ctx, `${options.name} settings:\n${lines.join("\n")}`, "info");
      return;
    }

    const spec = specs.get(key);
    if (!spec) {
      notify(ctx, `Unknown setting "${key}". Options: ${[...specs.keys()].join(", ")}`, "error");
      return;
    }

    const rawValue = parts.slice(1).join(" ").trim();

    if (!rawValue) {
      if (spec.type === "enum") {
        const lines = spec.values.map((value) => {
          const description = spec.describe?.(value);
          return description ? `  ${value.padEnd(10)} ${description}` : `  ${value}`;
        });
        notify(ctx, `${key} = ${formatValue(spec)}\nAvailable:\n${lines.join("\n")}`, "info");
        return;
      }
      notify(ctx, `${key} = ${formatValue(spec)}`, "info");
      return;
    }

    if (spec.type === "boolean") {
      const parsed = parseBoolean(rawValue.toLowerCase());
      if (parsed === undefined) {
        notify(ctx, `Usage: /${options.name} ${key} on|off`, "error");
        return;
      }
      spec.set(parsed);
    } else if (spec.type === "enum") {
      if (!spec.values.includes(rawValue)) {
        notify(ctx, `Unknown value "${rawValue}". Available: ${spec.values.join(", ")}`, "error");
        return;
      }
      spec.set(rawValue);
    } else if (spec.type === "number") {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        notify(ctx, `Usage: /${options.name} ${key} <number>`, "error");
        return;
      }
      spec.set(parsed);
    } else {
      spec.set(rawValue);
    }

    await options.onChange?.(key, ctx);
    options.save();
    notify(ctx, `${options.name} ${key}: ${formatValue(spec)}`, "info");
  };
}
