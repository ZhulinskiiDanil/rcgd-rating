import { synchronize } from "../services/sync";
import { db, one } from "../database";
import { initializeHeadAdmin } from "../services/initialize";
export default defineNitroPlugin((nitroApp) => {
  db();
  initializeHeadAdmin();
  if (process.env.SYNC_ENABLED === "false") return;
  let active = false;
  const minutes = Math.max(15, Number(process.env.SYNC_INTERVAL_MINUTES) || 60);
  async function tick() {
    if (active) return;
    const last = one<{ startedAt: string }>(
      "SELECT startedAt FROM syncRuns ORDER BY id DESC LIMIT 1",
    );
    if (last && Date.now() - Date.parse(last.startedAt) < minutes * 60000)
      return;
    active = true;
    try {
      await synchronize();
    } catch (error) {
      console.error(
        "Синхронизация:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      active = false;
    }
  }
  const initial = setTimeout(() => void tick(), 3000);
  const timer = setInterval(() => void tick(), 60000);
  timer.unref();
  initial.unref();
  nitroApp.hooks.hook("close", () => {
    clearInterval(timer);
    clearTimeout(initial);
  });
});
