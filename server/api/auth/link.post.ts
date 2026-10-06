import { z } from "zod";
export default defineEventHandler(async (event) => {
  const user = await requireAccount(event);
  const { provider } = await readValidatedBody(
    event,
    z.object({ provider: z.enum(["google", "discord"]) }).parse,
  );
  const config = useRuntimeConfig().oauth[provider];
  if (!config.clientId || !config.clientSecret)
    throw createError({
      statusCode: 503,
      message: "Провайдер ещё не настроен",
    });
  await setUserSession(event, { secure: { linkAccountId: user.id } });
  return { url: `/auth/${provider}` };
});
