export * from "./completion-alert.ts";
export * from "./naming.ts";
export * from "./osc-title.ts";
export * from "./settings.ts";
export * from "./settings-command.ts";
export * from "./spinner.ts";
export * from "./title-controller.ts";

export type SessionContextWithUi = { hasUI: boolean };

/** Sub-agent sessions share the process but must not fight over the host's title. */
export function isMainAgentSession(ctx: SessionContextWithUi): boolean {
  return ctx.hasUI;
}
