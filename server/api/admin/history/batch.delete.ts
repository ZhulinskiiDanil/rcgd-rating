import { deleteHistoryBatch } from "../../../services/history-editor";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "history:write");
  return deleteHistoryBatch(await readBody(event), actor.id);
});
