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
    session: { maxAge: 60 * 60 * 24 * 7, sessionHeader: false },
  },
  nitro: { preset: "node-server", externals: { external: ["better-sqlite3"] } },
  app: {
    head: {
      htmlAttrs: { lang: "ru" },
      title: "СПб Demonlist",
      link: [
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico?v=crest-1" },
        {
          rel: "icon",
          type: "image/png",
          sizes: "96x96",
          href: "/spb-favicon.png",
        },
      ],
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
