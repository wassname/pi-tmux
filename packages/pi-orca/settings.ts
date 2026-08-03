import {
  asObject,
  DEFAULT_NAMING,
  normalizeNaming,
  readSettingsFile,
  writeSettingsFile,
  type NamingConfig,
} from "./core/index.ts";

const SETTINGS_FILE = "pi-orca.json";

export type PiOrcaSettings = {
  naming: NamingConfig;
};

export const DEFAULT_SETTINGS: PiOrcaSettings = {
  naming: { ...DEFAULT_NAMING },
};

export function normalizeSettings(value: unknown): PiOrcaSettings {
  const root = asObject(value);
  return { naming: normalizeNaming(root.naming) };
}

export function loadSettings(): PiOrcaSettings {
  return normalizeSettings(readSettingsFile(SETTINGS_FILE));
}

export function saveSettings(settings: PiOrcaSettings): void {
  writeSettingsFile(SETTINGS_FILE, settings);
}
