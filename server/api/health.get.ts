import { db } from "../database";
export default defineEventHandler(() => {
  db().prepare("SELECT 1").get();
  return { ok: true };
});
