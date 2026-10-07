import { createError } from "h3";
import { account, db } from "../database";
import { imageUrl } from "./media";
import { logChange } from "./changes";

export function assertAvatarChangeAllowed(id: number, sessionKey: string) {
  const user = account(id);
  if (!user || user.disabled || user.sessionKey !== sessionKey)
    throw createError({ statusCode: 401, message: "Войдите в аккаунт заново" });
  if (user.avatarLocked)
    throw createError({
      statusCode: 403,
      message: "Администрация запретила изменение аватарки",
    });
}

export function saveOwnAvatar(id: number, sessionKey: string, url: string) {
  const avatar = imageUrl.parse(url);
  return db().transaction(() => {
    assertAvatarChangeAllowed(id, sessionKey);
    db().prepare("UPDATE accounts SET avatarUrl=? WHERE id=?").run(avatar, id);
    logChange(
      "avatar",
      id,
      "Изменена аватарка аккаунта",
      null,
      { accountId: id },
      id,
      false,
    );
    return { url: avatar };
  })();
}
