export default defineEventHandler(async (event) => {
  const user = await currentAccount(event);
  return user
    ? {
        id: user.id,
        login: user.login,
        nickname: user.nickname || user.login,
        headAdmin: !!user.headAdmin,
        permissions: user.permissions,
        avatar: user.avatarUrl || user.discordAvatar || user.googleAvatar,
      }
    : null;
});
