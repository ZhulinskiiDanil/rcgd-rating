import { account } from "../database";
import { sessionMatchesAccount } from "../services/account-session";

export default defineNitroPlugin(() => {
  sessionHooks.hook("fetch", async (session, event) => {
    const user = session.user?.id ? account(session.user.id) : undefined;
    if (sessionMatchesAccount(session, user)) return;
    delete session.user;
    delete session.secure;
    await clearUserSession(event);
  });
});
