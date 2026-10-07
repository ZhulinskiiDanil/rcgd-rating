import { readImageBody, saveImage } from "../../services/media";
import {
  assertAvatarChangeAllowed,
  saveOwnAvatar,
} from "../../services/account-avatar";

export default defineEventHandler(async (event) => {
  const user = await requireAccount(event);
  assertAvatarChangeAllowed(user.id, user.sessionKey);
  throttle(event, "own-avatar", 15, 60);
  const body = await readImageBody(event.node.req);
  const url = await saveImage(body, getRequestHeader(event, "content-type"));
  return saveOwnAvatar(user.id, user.sessionKey, url);
});
