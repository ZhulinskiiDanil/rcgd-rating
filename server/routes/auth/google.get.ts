export default defineOAuthGoogleEventHandler({
  config: { scope: ["openid", "profile"] },
  async onSuccess(event, { user }) {
    return finishOAuth(event, "google", user.sub, user.picture || null);
  },
  onError(event) {
    return sendRedirect(event, "/login?error=oauth");
  },
});
