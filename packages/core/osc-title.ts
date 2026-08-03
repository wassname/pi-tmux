let currentTerminalTitle: string | undefined;

export type TerminalTitleRuntime = {
  getTitle(): string;
  setTitle(title: string): boolean;
};

export function getTerminalTitle(fallbackTitle = ""): string {
  return currentTerminalTitle ?? fallbackTitle;
}

export function createTerminalTitleRuntime(baseTitle: string): TerminalTitleRuntime {
  currentTerminalTitle = baseTitle;

  return {
    getTitle() {
      return getTerminalTitle(baseTitle);
    },
    setTitle(title: string) {
      setTerminalTitle(title);
      return true;
    },
  };
}

/** OSC 2: set the window/tab title of the host terminal. */
export function setTerminalTitle(title: string): void {
  currentTerminalTitle = title;
  process.stdout.write(`\x1b]2;${title}\x07`);
}

/** BEL makes hosts such as Zed raise their own "task finished" notification. */
export function ringTerminalBell(): void {
  if (process.stdout.isTTY) {
    process.stdout.write("\x07");
  }
}

/** Strip a trailing ` - <suffix>` from OSC 0 title sequences. */
export function stripTitleSuffix(data: string, suffix: string): string {
  return data.replace(/\x1b\]0;([^\x07\x1b]*)(\x07|\x1b\\)/g, (match, title: string, terminator: string) => {
    if (!title.endsWith(suffix)) return match;
    return `\x1b]0;${title.slice(0, -suffix.length)}${terminator}`;
  });
}

let titleSuffixStripperInstalled = false;

// Pi rewrites the terminal title as "π - <session> - <cwd>" on every update, so the
// trailing " - <cwd>" cannot be removed from an extension by event ordering alone.
// Filtering stdout catches every title regardless of who wrote it.
export function installTitleSuffixStripper(cwdBasename: string): void {
  if (titleSuffixStripperInstalled || !cwdBasename) return;
  titleSuffixStripperInstalled = true;

  const suffix = ` - ${cwdBasename}`;
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (typeof chunk === "string" && chunk.includes("\x1b]0;")) {
      chunk = stripTitleSuffix(chunk, suffix);
    }
    return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;
}
