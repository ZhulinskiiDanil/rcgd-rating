export default defineEventHandler(() => {
  const config = useRuntimeConfig();
  return {
    google: !!(
      config.oauth.google.clientId && config.oauth.google.clientSecret
    ),
    discord: !!(
      config.oauth.discord.clientId && config.oauth.discord.clientSecret
    ),
  };
});
