import { createHistoryEvent } from "../../../services/history-editor";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "history:write");
  return createHistoryEvent(await readBody(event), actor.id);
});
