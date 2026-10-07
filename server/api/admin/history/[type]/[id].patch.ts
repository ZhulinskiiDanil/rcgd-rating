import {
  editHistory,
  historyTarget,
} from "../../../../services/history-editor";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "history:write");
  const target = historyTarget(
    getRouterParam(event, "type"),
    getRouterParam(event, "id"),
  );
  return editHistory(target.type, target.id, await readBody(event), actor.id);
});
