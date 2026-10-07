import { one } from "../../database";
import { isRecentOAuthProof } from "../../services/password-account";

export default defineEventHandler(async (event) => {
  const user = await currentAccount(event);
  if (!user) return null;
  const player = one<{ id: number; name: string }>(
    "SELECT id,name FROM players WHERE accountId=? AND deletedAt IS NULL",
    user.id,
  );
  const session = await getUserSession(event);
  return {
    id: user.id,
    login: user.login,
    nickname: player?.name || user.nickname || user.login,
    playerId: player?.id ?? null,
    headAdmin: !!user.headAdmin,
    permissions: user.permissions,
    avatar: user.avatarUrl || user.discordAvatar || user.googleAvatar,
    avatarLocked: !!user.avatarLocked,
    hasPassword: !!user.passwordHash,
    canResetPassword: isRecentOAuthProof(session.secure),
  };
});
