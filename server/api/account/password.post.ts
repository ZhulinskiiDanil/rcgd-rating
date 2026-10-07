import { z } from "zod";
import {
  changeOwnPassword,
  isRecentOAuthProof,
  accountDestination,
} from "../../services/password-account";

export default defineEventHandler(async (event) => {
  throttle(event, "password-change", 10, 15);
  const value = await readValidatedBody(
    event,
    z.object({
      password: z
        .string()
        .min(8, "Пароль должен содержать не менее 8 символов")
        .max(128),
      currentPassword: z.string().max(128).optional(),
      login: z.string().trim().min(1).max(64).optional(),
    }).parse,
  );
  const user = await requireAccount(event, true);
  const session = await getUserSession(event);
  const key = changeOwnPassword(
    user.id,
    user.sessionKey,
    value,
    isRecentOAuthProof(session.secure),
  );
  await replaceUserSession(event, {
    user: { id: user.id },
    secure: {
      accountKey: key,
      authMethod: "password",
      reauthenticatedAt: Date.now(),
    },
  });
  return { ok: true, url: accountDestination(user.id) };
});
