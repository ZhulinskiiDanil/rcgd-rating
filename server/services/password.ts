import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hashSecret(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifySecret(hash: string, password: string) {
  const [kind, salt, digest] = hash.split(":");
  if (kind !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "hex"),
    actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
