const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedOrigin(origin: string | undefined, expected: string) {
  if (!origin || origin === "null") return false;
  try {
    const source = new URL(origin);
    const target = new URL(expected);
    if (source.origin !== origin) return false;
    if (source.origin === target.origin) return true;
    return (
      loopbackHosts.has(source.hostname) &&
      loopbackHosts.has(target.hostname) &&
      source.protocol === target.protocol &&
      source.port === target.port
    );
  } catch {
    return false;
  }
}
