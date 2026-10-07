import { z } from "zod";
import {
  authenticatePassword,
  accountDestination,
} from "../../services/password-account";

export default defineEventHandler(async (event) => {
  throttle(event, "login", 15, 15);
  const body = await readValidatedBody(
    event,
    z.object({
      login: z.string().trim().min(1).max(64),
      password: z.string().min(1).max(128),
    }).parse,
  );
  const user = authenticatePassword(body.login, body.password);
  await replaceUserSession(event, {
    user: { id: user.id },
    secure: {
      accountKey: user.sessionKey,
      authMethod: "password",
      reauthenticatedAt: Date.now(),
    },
  });
  return { ok: true, url: accountDestination(user.id) };
});
