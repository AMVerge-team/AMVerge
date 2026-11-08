// what a failed depth / upscale pass tells the user; the cli's own usage text means nothing to them

/** the cli turned down a flag: the installed amverge predates what the app sends */
export function isOutdatedCliError(err: unknown): boolean {
  const text = String(err instanceof Error ? err.message : err);
  return /No such option:|Usage: amverge/i.test(text);
}

/** a readable reason for a failed pass */
export function passErrorMessage(err: unknown): string {
  const text = String(err instanceof Error ? err.message : err);
  if (isOutdatedCliError(text)) {
    const flag = text.match(/No such option:\s*(\S+)/i)?.[1];
    return (
      "The installed AMVerge AI tools are too old for this" +
      (flag ? ` (they don't know ${flag})` : "") +
      ". AMVerge updates them by itself the next time it starts after the update is released."
    );
  }
  return text;
}
