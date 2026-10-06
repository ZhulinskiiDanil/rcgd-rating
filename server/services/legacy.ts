import { all, db } from "../database";
import { logChange } from "./changes";

export function resetLegacy() {
  return db().transaction(() => {
    const old = all<{
      id: number;
      name: string;
      exitedAt: string | null;
      lastMainRank: number | null;
      exitReason: string | null;
    }>(
      "SELECT id,name,exitedAt,lastMainRank,exitReason FROM levels WHERE status='legacy'",
    );
    if (!old.length) return 0;
    db()
      .prepare(
        "UPDATE levels SET status='catalog',exitedAt=NULL,lastMainRank=NULL,exitReason=NULL WHERE status='legacy'",
      )
      .run();
    const resetAt = new Date().toISOString();
    db()
      .prepare(
        "INSERT OR REPLACE INTO settings(key,value) VALUES('legacyResetAt',?)",
      )
      .run(resetAt);
    logChange(
      "legacy-reset",
      null,
      "Legacy очищен: теперь архив учитывает только новые вылеты из основного листа",
      old,
      { removed: old.length, resetAt },
    );
    return old.length;
  })();
}
