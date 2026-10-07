import { createError, isError, sendRedirect, type H3Event } from "h3";
import { account } from "../database";
import { resolveOAuthIdentity } from "../services/oauth-identity";

export async function finishOAuth(
  event: H3Event,
  provider: "discord" | "google",
  subject: string,
  avatar: string | null,
) {
  let id: number;
  try {
    id = resolveOAuthIdentity(provider, subject, avatar);
  } catch (error) {
    if (isError(error) && error.statusCode === 403)
      return sendRedirect(event, "/login?error=oauth");
    throw error;
  }
  const user = account(id);
  if (!user || user.disabled || !user.sessionKey)
    throw createError({ statusCode: 403, message: "Аккаунт недоступен" });
  await replaceUserSession(event, {
    user: { id },
    secure: {
      accountKey: user.sessionKey,
      authMethod: provider,
      reauthenticatedAt: Date.now(),
    },
  });
  return sendRedirect(event, "/account/settings?password=setup");
}
