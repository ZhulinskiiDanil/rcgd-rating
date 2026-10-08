import { db } from "../../database";
import { listAdminAudit } from "../../services/admin-audit";

export default defineEventHandler(async (event) => {
  await requireSeniorAdmin(event);
  setResponseHeader(event, "Cache-Control", "no-store");
  return listAdminAudit(db(), getQuery(event));
});
