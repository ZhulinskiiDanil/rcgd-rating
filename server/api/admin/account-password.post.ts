import { z } from "zod";
import { resetAccountPassword } from "../../services/account-recovery";

export default defineEventHandler(async (event) => {
  const actor = await requireSeniorAdmin(event);
  throttle(event, "admin-password-recovery", 20, 15);
  const { id } = await readValidatedBody(
    event,
    z.object({ id: z.number().int().positive() }).parse,
  );
  setResponseHeader(event, "Cache-Control", "no-store");
  return resetAccountPassword(id, actor.id);
});
