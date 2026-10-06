export default defineNuxtConfig({
  compatibilityDate: "2026-10-06",
  buildDir: ".nuxt",
  devtools: { enabled: false },
  modules: ["nuxt-auth-utils"],
  runtimeConfig: {
    oauth: {
      google: { clientId: "", clientSecret: "", redirectURL: "" },
      discord: { clientId: "", clientSecret: "", redirectURL: "" },
    },
    session: { maxAge: 60 * 60 * 24 * 7 },
  },
  nitro: { preset: "node-server", externals: { external: ["better-sqlite3"] } },
  app: {
    head: {
      htmlAttrs: { lang: "ru" },
      title: "СПб Demonlist",
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
      meta: [
        {
          name: "description",
          content:
            "Демоны, пройденные игроками Санкт-Петербурга и Ленинградской области.",
        },
      ],
    },
  },
  typescript: { strict: true },
});
