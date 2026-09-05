import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

import type { SpinnerConfig } from "./spinner.ts";
import { DEFAULT_TITLE_MAX_CHARS, type NamingConfig } from "./naming.ts";

export type CompletionAlertConfig = {
  enabled: boolean;
  bellEnabled: boolean;
  focusedMarkAutoClearMs: number;
  markWatchIntervalMs: number;
  markWatchMaxMs: number;
  mark: string;
};

export const DEFAULT_SPINNER: SpinnerConfig = {
  enabled: true,
  style: "default",
  speed: "normal",
};

export const DEFAULT_COMPLETION_ALERT: CompletionAlertConfig = {
  enabled: true,
  bellEnabled: true,
  focusedMarkAutoClearMs: 5000,
  markWatchIntervalMs: 500,
  markWatchMaxMs: 30 * 60 * 1000,
  mark: "🔔",
};

export const DEFAULT_NAMING: NamingConfig = {
  enabled: true,
  model: "",
  thinking: "low",
  maxChars: DEFAULT_TITLE_MAX_CHARS,
};

export function settingsPath(fileName: string): string {
  return join(getAgentDir(), fileName);
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function readOptionalString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : [...fallback];
}

export function normalizeSpinner(value: unknown, defaults: SpinnerConfig = DEFAULT_SPINNER): SpinnerConfig {
  const spinner = asObject(value);
  return {
    enabled: readBoolean(spinner.enabled, defaults.enabled),
    style: readString(spinner.style, defaults.style),
    speed: readString(spinner.speed, defaults.speed),
  };
}

export function normalizeCompletionAlert(
  value: unknown,
  defaults: CompletionAlertConfig = DEFAULT_COMPLETION_ALERT,
): CompletionAlertConfig {
  const alert = asObject(value);
  return {
    enabled: readBoolean(alert.enabled, defaults.enabled),
    bellEnabled: readBoolean(alert.bellEnabled, defaults.bellEnabled),
    focusedMarkAutoClearMs: readNumber(alert.focusedMarkAutoClearMs, defaults.focusedMarkAutoClearMs),
    markWatchIntervalMs: readNumber(alert.markWatchIntervalMs, defaults.markWatchIntervalMs),
    markWatchMaxMs: readNumber(alert.markWatchMaxMs, defaults.markWatchMaxMs),
    mark: readString(alert.mark, defaults.mark),
  };
}

export function normalizeNaming(value: unknown, defaults: NamingConfig = DEFAULT_NAMING): NamingConfig {
  const naming = asObject(value);
  return {
    enabled: readBoolean(naming.enabled, defaults.enabled),
    model: readOptionalString(naming.model, defaults.model),
    thinking: readString(naming.thinking, defaults.thinking),
    maxChars: readNumber(naming.maxChars, defaults.maxChars),
  };
}

export function readSettingsFile(fileName: string): unknown {
  const path = settingsPath(fileName);
  if (!existsSync(path)) return undefined;

  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

export function writeSettingsFile(fileName: string, settings: unknown): void {
  writeFileSync(settingsPath(fileName), `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}
