import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { basename, join } from "node:path";

import {
  compactTitle,
  createSettingsCommand,
  createTitleController,
  getFirstUserPrompt,
  isMainAgentSession,
  type AnyContext,
} from "./core/index.ts";
import { loadSettings, saveSettings, type PiOrcaSettings } from "./settings.ts";

const ORCA_RENAME_TIMEOUT_MS = 5_000;

function getOrcaCliCommand(): string {
  if (process.env.ORCA_CLI_PATH) return process.env.ORCA_CLI_PATH;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "Programs", "orca", "resources", "bin", "orca.exe");
  }
  return "orca";
}

export default function piOrcaExtension(pi: ExtensionAPI) {
  if (!process.env.ORCA_PANE_KEY) return;

  let settings: PiOrcaSettings = loadSettings();

  // Orca normalises Pi's OSC title to "Pi" for its own status display, so the tab
  // label has to be set through the CLI to survive.
  const renameOrcaTab = async (title: string): Promise<boolean> => {
    const terminalHandle = process.env.ORCA_TERMINAL_HANDLE;
    if (!terminalHandle) return false;

    try {
      const result = await pi.exec(
        getOrcaCliCommand(),
        ["terminal", "rename", "--terminal", terminalHandle, "--title", title, "--json"],
        { timeout: ORCA_RENAME_TIMEOUT_MS },
      );
      return result.code === 0;
    } catch {
      return false;
    }
  };

  const applyFallbackTabTitle = (ctx: AnyContext, title: string): void => {
    if (!ctx.hasUI) return;
    const cwd = basename(ctx.sessionManager.getCwd()) || ctx.sessionManager.getCwd();
    ctx.ui.setTitle(`\u03c0 - ${title} - ${cwd}`);
  };

  const title = createTitleController({
    pi,
    getNaming: () => settings.naming,
    async applyTitle(rawTitle, ctx) {
      const normalized = compactTitle(rawTitle, settings.naming.maxChars);
      if (!normalized) return undefined;

      pi.setSessionName(normalized);
      if (!(await renameOrcaTab(normalized))) {
        applyFallbackTabTitle(ctx, normalized);
      }

      return normalized;
    },
  });

  const settingsCommand = createSettingsCommand({
    name: "pi-orca",
    save: () => saveSettings(settings),
    specs: [
      {
        key: "naming",
        type: "boolean",
        get: () => settings.naming.enabled,
        set: (value) => {
          settings.naming.enabled = value;
        },
      },
      {
        key: "naming-model",
        type: "string",
        get: () => settings.naming.model || "(current session model)",
        set: (value) => {
          settings.naming.model = value === "-" ? "" : value;
        },
      },
      {
        key: "max-chars",
        type: "number",
        get: () => settings.naming.maxChars,
        set: (value) => {
          settings.naming.maxChars = value;
        },
      },
    ],
  });

  pi.registerCommand("rename", {
    description: "Rename the Orca tab title from the conversation or an explicit title",
    handler: (args: string, ctx: ExtensionCommandContext) => title.renameCommand(args, ctx),
  });

  pi.registerCommand("pi-orca", {
    description: "Configure Orca tab title naming",
    handler: settingsCommand,
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!isMainAgentSession(ctx)) return;

    title.reset();
    settings = loadSettings();
    await title.restoreExistingTitle(ctx);
  });

  pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
    if (!isMainAgentSession(ctx)) return;

    const firstPrompt = getFirstUserPrompt(ctx.sessionManager.getBranch()) ?? event.prompt;
    void title.applyAutoTitle(firstPrompt, ctx);
  });
}
