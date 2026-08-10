import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  buildConversationNamingSource,
  compactTitle,
  describeRenameFailure,
  generateTitle,
  type NamingConfig,
  type NamingSource,
  type RenameFailureReason,
} from "./naming.ts";

export type AnyContext = ExtensionContext | ExtensionCommandContext;

export type RenameResult =
  | { ok: true; title: string }
  | { ok: false; reason: RenameFailureReason; detail?: string };

export type TitleControllerOptions = {
  pi: ExtensionAPI;
  getNaming: () => NamingConfig;
  /** Push the title everywhere this host can show it. Returns the applied title. */
  applyTitle: (title: string, ctx: AnyContext) => Promise<string | undefined> | string | undefined;
};

export function notify(ctx: AnyContext, message: string, level: "info" | "error"): void {
  if (!ctx.hasUI) return;
  ctx.ui.notify(message, level);
}

export function createTitleController(options: TitleControllerOptions) {
  let hasTitleForSession = false;
  let hasAttemptedTitleForSession = false;
  let renameInFlight: Promise<RenameResult> | null = null;
  let sessionEpoch = 0;

  const persistTitle = async (title: string, ctx: AnyContext): Promise<string | undefined> => {
    const applied = await options.applyTitle(title, ctx);
    if (!applied) return undefined;

    hasTitleForSession = true;
    hasAttemptedTitleForSession = true;
    return applied;
  };

  const runRename = async (
    prompt: string | undefined,
    source: NamingSource,
    ctx: AnyContext,
    force = false,
  ): Promise<RenameResult> => {
    const naming = options.getNaming();
    if (!naming.enabled) return { ok: false, reason: "skipped" };

    if (!force && (hasTitleForSession || hasAttemptedTitleForSession || renameInFlight)) {
      return { ok: false, reason: "skipped" };
    }

    const seed = prompt?.trim();
    if (!seed) {
      return { ok: false, reason: "missing_prompt" };
    }

    if (!force) {
      hasAttemptedTitleForSession = true;
    }

    const currentEpoch = sessionEpoch;
    const work = (async (): Promise<RenameResult> => {
      const result = await generateTitle(seed, source, ctx as ExtensionContext, naming);
      if (!result.ok) return result;

      if (currentEpoch !== sessionEpoch) {
        return { ok: false, reason: "stale_session" };
      }

      const title = await persistTitle(result.title, ctx);
      if (!title) {
        return { ok: false, reason: "invalid_output" };
      }

      return { ok: true, title };
    })();

    const inFlight = work.finally(() => {
      if (renameInFlight === inFlight) {
        renameInFlight = null;
      }
    });

    renameInFlight = inFlight;
    return inFlight;
  };

  return {
    reset(): void {
      sessionEpoch += 1;
      hasTitleForSession = false;
      hasAttemptedTitleForSession = false;
      renameInFlight = null;
    },

    /** Reapply the name a resumed session already has instead of generating a new one. */
    async restoreExistingTitle(ctx: AnyContext): Promise<boolean> {
      const naming = options.getNaming();
      if (!naming.enabled) return false;

      const existing = options.pi.getSessionName();
      if (!existing) return false;

      const restored = compactTitle(existing, naming.maxChars);
      if (!restored) return false;

      return !!(await persistTitle(restored, ctx));
    },

    async applyAutoTitle(seedPrompt: string | undefined, ctx: AnyContext): Promise<void> {
      if (await this.restoreExistingTitle(ctx)) return;
      await runRename(seedPrompt, "user_message", ctx);
    },

    async renameCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
      await ctx.waitForIdle();
      if (renameInFlight) await renameInFlight;

      const naming = options.getNaming();

      if (args.trim()) {
        const explicitTitle = compactTitle(args, naming.maxChars);
        if (!explicitTitle) {
          notify(ctx, "Usage: /rename [title]", "error");
          return;
        }

        const title = await persistTitle(explicitTitle, ctx);
        if (!title) {
          notify(ctx, "Invalid title.", "error");
          return;
        }

        notify(ctx, `Renamed title: ${title}`, "info");
        return;
      }

      const conversation = buildConversationNamingSource(ctx.sessionManager.getBranch());
      const result = await runRename(conversation, "conversation", ctx, true);

      if (!result.ok) {
        notify(ctx, describeRenameFailure(result.reason, result.detail), "error");
        return;
      }

      notify(ctx, `Renamed title: ${result.title}`, "info");
    },
  };
}
