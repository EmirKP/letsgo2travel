/** Resolves a validated 12-character source commit, or "unknown" for an unidentified archive. */
export function resolveMobileSourceIdentity(
  rootDir: string,
  env?: Record<string, string | undefined>,
): string;
