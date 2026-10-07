import { saveOwnAvatar } from "../../services/account-avatar";

export default defineEventHandler(async (event) => {
  const user = await requireAccount(event);
  return saveOwnAvatar(user.id, user.sessionKey, "");
});
