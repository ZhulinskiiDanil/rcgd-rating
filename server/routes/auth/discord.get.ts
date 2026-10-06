export default defineOAuthDiscordEventHandler({
  config: { scope: ["identify"], emailRequired: false },
  async onSuccess(event, { user }) {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : null;
    return finishOAuth(event, "discord", user.id, avatar);
  },
  onError(event) {
    return sendRedirect(event, "/login?error=oauth");
  },
});
