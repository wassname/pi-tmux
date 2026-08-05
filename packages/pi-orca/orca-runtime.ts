import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

export type OrcaExecResult = {
  code: number;
  stdout?: string;
  stderr?: string;
};

export type OrcaExec = (
  command: string,
  args: string[],
  options: { timeout: number },
) => Promise<OrcaExecResult>;

export type OrcaRuntime = {
  isAvailable(): boolean;
  terminalHandle(): string | undefined;
  getName(terminalHandle: string): Promise<string>;
  setName(terminalHandle: string, name: string): Promise<boolean>;
  isTargetVisible(terminalHandle: string): Promise<boolean>;
  isAppFocused(): Promise<boolean>;
  refresh(): void;
};

type OrcaTerminal = {
  handle?: string;
  worktreeId?: string;
  tabId?: string;
  title?: string;
};

type OrcaVisualLayout = {
  worktreeId?: string;
  root?: unknown;
};

type TerminalSnapshot = {
  terminals: OrcaTerminal[];
  visualLayouts: OrcaVisualLayout[];
};

const ORCA_CLI_TIMEOUT_MS = 5_000;
const SNAPSHOT_CACHE_MS = 250;

function normalizeTarget(value: string | undefined): string | undefined {
  const target = value?.trim();
  return target || undefined;
}

export function getOrcaCliCommand(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ORCA_CLI_PATH) return env.ORCA_CLI_PATH;
  if (process.platform === "win32" && env.LOCALAPPDATA) {
    return join(env.LOCALAPPDATA, "Programs", "orca", "resources", "bin", "orca.exe");
  }
  return "orca";
}

function parseSnapshot(stdout: string | undefined): TerminalSnapshot | undefined {
  if (!stdout) return undefined;

  try {
    const response = JSON.parse(stdout) as {
      ok?: boolean;
      result?: { terminals?: unknown; visualLayouts?: unknown };
    };
    if (response.ok === false || !response.result) return undefined;

    return {
      terminals: Array.isArray(response.result.terminals)
        ? (response.result.terminals as OrcaTerminal[])
        : [],
      visualLayouts: Array.isArray(response.result.visualLayouts)
        ? (response.result.visualLayouts as OrcaVisualLayout[])
        : [],
    };
  } catch {
    return undefined;
  }
}

function containsActiveTab(value: unknown, tabId: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsActiveTab(item, tabId));

  const object = value as Record<string, unknown>;
  if (object.activeTabId === tabId) return true;
  return Object.values(object).some((item) => containsActiveTab(item, tabId));
}

export function createOrcaRuntime(
  exec: OrcaExec,
  env: NodeJS.ProcessEnv = process.env,
): OrcaRuntime {
  const command = getOrcaCliCommand(env);
  const lastKnownNames = new Map<string, string>();
  let cachedSnapshot: { value: TerminalSnapshot; capturedAt: number } | undefined;
  let visualLayoutsMode: "default" | "flag" | undefined;

  const runOrca = async (args: string[]): Promise<OrcaExecResult> => {
    try {
      return await exec(command, args, { timeout: ORCA_CLI_TIMEOUT_MS });
    } catch (error) {
      return { code: 1, stderr: error instanceof Error ? error.message : String(error) };
    }
  };

  const requestSnapshot = async (includeVisualLayouts: boolean) => {
    const args = ["terminal", "list", "--limit", "1000"];
    if (includeVisualLayouts) args.push("--include-visual-layouts");
    args.push("--json");

    const result = await runOrca(args);
    return result.code === 0 ? parseSnapshot(result.stdout) : undefined;
  };

  const loadSnapshot = async (): Promise<TerminalSnapshot | undefined> => {
    if (cachedSnapshot && Date.now() - cachedSnapshot.capturedAt <= SNAPSHOT_CACHE_MS) {
      return cachedSnapshot.value;
    }

    let snapshot = await requestSnapshot(visualLayoutsMode === "flag");
    if (!snapshot) return undefined;

    // Older Orca versions return visualLayouts by default. Newer versions keep
    // terminal list bounded and require --include-visual-layouts instead.
    if (visualLayoutsMode === undefined) {
      if (snapshot.visualLayouts.length > 0) {
        visualLayoutsMode = "default";
      } else {
        const withLayouts = await requestSnapshot(true);
        if (withLayouts) {
          snapshot = withLayouts;
          visualLayoutsMode = "flag";
        } else {
          visualLayoutsMode = "default";
        }
      }
    }

    cachedSnapshot = { value: snapshot, capturedAt: Date.now() };
    for (const terminal of snapshot.terminals) {
      if (terminal.handle && typeof terminal.title === "string") {
        lastKnownNames.set(terminal.handle, terminal.title);
      }
    }
    return snapshot;
  };

  const findTerminal = (snapshot: TerminalSnapshot | undefined, target: string) =>
    snapshot?.terminals.find((terminal) => terminal.handle === target);

  return {
    isAvailable(): boolean {
      return !!normalizeTarget(env.ORCA_PANE_KEY);
    },

    terminalHandle(): string | undefined {
      return normalizeTarget(env.ORCA_TERMINAL_HANDLE);
    },

    async getName(target: string): Promise<string> {
      const terminal = findTerminal(await loadSnapshot(), target);
      return typeof terminal?.title === "string"
        ? terminal.title
        : (lastKnownNames.get(target) ?? "");
    },

    async setName(target: string, name: string): Promise<boolean> {
      const result = await runOrca([
        "terminal",
        "rename",
        "--terminal",
        target,
        "--title",
        name,
        "--json",
      ]);
      if (result.code !== 0) return false;

      lastKnownNames.set(target, name);
      const terminal = findTerminal(cachedSnapshot?.value, target);
      if (terminal) terminal.title = name;
      return true;
    },

    async isTargetVisible(target: string): Promise<boolean> {
      const snapshot = await loadSnapshot();
      const terminal = findTerminal(snapshot, target);
      if (!terminal?.tabId || !terminal.worktreeId) return false;

      const layout = snapshot?.visualLayouts.find(
        (candidate) => candidate.worktreeId === terminal.worktreeId,
      );
      return containsActiveTab(layout?.root, terminal.tabId);
    },

    // Orca does not expose window-level focus, so its selected tab counts as visible.
    async isAppFocused(): Promise<boolean> {
      return true;
    },

    refresh(): void {
      cachedSnapshot = undefined;
    },
  };
}

export function createPiOrcaRuntime(pi: ExtensionAPI): OrcaRuntime {
  return createOrcaRuntime((command, args, options) => pi.exec(command, args, options));
}
