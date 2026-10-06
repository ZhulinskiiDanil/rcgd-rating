<script setup lang="ts">
const { data: session } = await useAccount();
const user = computed(() => session.value?.user);
const route = useRoute(),
  menuOpen = ref(false);
const preference = useCookie<"light" | "dark">("spb-theme", {
  default: () => "light",
  sameSite: "lax",
  maxAge: 31536000,
});
const theme = computed(() => (preference.value === "dark" ? "dark" : "light"));
const toggleTheme = () => {
  preference.value = theme.value === "light" ? "dark" : "light";
};
watch(
  () => route.path,
  () => {
    menuOpen.value = false;
  },
);
useHead(() => ({
  htmlAttrs: { "data-theme": theme.value },
  meta: [
    {
      name: "theme-color",
      content: theme.value === "dark" ? "#081329" : "#f3f7fe",
    },
  ],
}));
const navigation = [
  { to: "/demonlist", text: "Демонлист" },
  { to: "/players", text: "Игроки" },
  { to: "/districts", text: "Районы" },
  { to: "/changelog", text: "История" },
  { to: "/rules", text: "Правила" },
];
const active = (path: string) =>
  path === "/demonlist"
    ? route.path === "/demonlist" || route.path.startsWith("/levels/")
    : route.path.startsWith(path);
</script>
<template>
  <div class="app" :class="'theme-' + theme">
    <a href="#main-content" class="skip-link">Перейти к содержимому</a>
    <header class="site-header" @keydown.esc="menuOpen = false">
      <div class="header-inner">
        <NuxtLink to="/" class="brand" aria-label="СПб Demonlist — главная">
          <svg
            class="city-mark"
            viewBox="0 0 90 55"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M1 49h88v4H1zM4 42h13v7H4zm3-5h7v5H7zm14-5h7v17h-7zm2-9h3v9h-3zm1-14h1v14h-1zm6 29h10v11H30zm11-7h13v18H41zm2-6h9v6h-9zm3-8h3v8h-3zm1-15h1v15h-1zm9 32h13v15H56zm3-6h7v6h-7zm3-10h1v10h-1zm10 23h12v8H72zm4-6h4v6h-4z"
            />
          </svg>
          <span
            ><strong>СПб Demonlist</strong
            ><small>Санкт-Петербург и область</small></span
          >
        </NuxtLink>
        <nav
          id="site-navigation"
          :class="{ open: menuOpen }"
          aria-label="Основная навигация"
        >
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            :class="{ selected: active(item.to) }"
            :aria-current="active(item.to) ? 'page' : undefined"
            >{{ item.text }}</NuxtLink
          >
          <NuxtLink
            v-if="user?.headAdmin || user?.permissions.length"
            to="/admin"
            :class="{ selected: active('/admin') }"
            >Админка</NuxtLink
          >
        </nav>
        <div class="header-actions">
          <button
            class="theme-toggle"
            :aria-label="
              theme === 'light'
                ? 'Включить тёмную тему'
                : 'Включить светлую тему'
            "
            :title="theme === 'light' ? 'Тёмная тема' : 'Светлая тема'"
            @click="toggleTheme"
          >
            <AppIcon :name="theme === 'light' ? 'moon' : 'sun'" :size="21" />
          </button>
          <NuxtLink
            :to="user ? '/account' : '/login'"
            class="account-link"
            :class="{ 'is-signed-in': user }"
            ><UserAvatar
              v-if="user"
              :name="user.nickname || user.login"
              :url="user.avatar"
            /><span>{{
              user?.nickname || user?.login || "Войти"
            }}</span></NuxtLink
          >
          <button
            class="menu-toggle"
            :aria-expanded="menuOpen"
            aria-controls="site-navigation"
            :aria-label="menuOpen ? 'Закрыть меню' : 'Открыть меню'"
            @click="menuOpen = !menuOpen"
          >
            <AppIcon :name="menuOpen ? 'close' : 'menu'" />
          </button>
        </div>
      </div>
    </header>
    <main id="main-content" tabindex="-1"><NuxtPage /></main>
    <ClientOnly><EntityEditorDialog /></ClientOnly>
    <footer>
      <div class="footer-brand">
        СПб Demonlist<span>Сложнейшие уровни. Достижения нашего города.</span>
      </div>
      <div class="footer-links">
        <NuxtLink to="/rules">Правила рейтинга</NuxtLink
        ><a href="https://demonlist.org" target="_blank" rel="noopener"
          >Global Demonlist <AppIcon name="external" :size="13" /></a
        ><a
          href="https://coreboard.pythonanywhere.com/main/levels"
          target="_blank"
          rel="noopener"
          >Coreboard <AppIcon name="external" :size="13"
        /></a>
      </div>
    </footer>
  </div>
</template>
<style scoped lang="scss">
@font-face {
  font-family: "Golos Text";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/golos-400.ttf") format("truetype");
}
@font-face {
  font-family: "Golos Text";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/golos-600.ttf") format("truetype");
}
@font-face {
  font-family: "Golos Text";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/golos-700.ttf") format("truetype");
}
@font-face {
  font-family: "Unbounded";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/unbounded-600.ttf") format("truetype");
}
:global(:root) {
  --bg: #f3f7fe;
  --surface: #fff;
  --surface-raised: #ebf1fc;
  --text: #0a1d55;
  --muted: #586b8f;
  --accent: #204dcc;
  --accent-soft: #e5edff;
  --on-accent: #fff;
  --warm: #95632e;
  --warm-soft: #faf0df;
  --line: #dce5f1;
  --radius: 18px;
  --success: #21745c;
  --danger: #b33c4a;
  --danger-soft: #ffedf0;
  --shadow: 0 12px 34px #1b408c08;
  --art-text: #fff;
  --art-bg: #102855;
  --silver: #527397;
  --bronze: #9f6547;
  --hero-opacity: 0.75;
  --hero-filter: none;
  color-scheme: light;
  background: var(--bg);
  scroll-behavior: smooth;
}
:global(html[data-theme="dark"]) {
  --bg: #081329;
  --surface: #101f3c;
  --surface-raised: #162a4b;
  --text: #ecf3ff;
  --muted: #a4b5d2;
  --accent: #93b9ff;
  --accent-soft: #203965;
  --on-accent: #091831;
  --warm: #eac181;
  --warm-soft: #392e28;
  --line: #2a3c5c;
  --success: #78d5b5;
  --danger: #ffb0b8;
  --danger-soft: #422735;
  --shadow: 0 12px 34px #00000018;
  --silver: #b6d5e9;
  --bronze: #e2ac91;
  --hero-opacity: 0.65;
  --hero-filter: brightness(0.52) saturate(0.75);
  color-scheme: dark;
}
:global(.entity-id) {
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
}
:global(body) {
  margin: 0;
}
:global(*) {
  box-sizing: border-box;
}
.app {
  min-height: 100vh;
  color: var(--text);
  background: var(--bg);
  font:
    16px/1.6 "Golos Text",
    sans-serif;
  font-variant-numeric: tabular-nums;
}
:where(.app) :deep(:where(a)) {
  color: inherit;
  text-decoration: none;
}
:where(.app) :deep(:where(a:hover)) {
  color: var(--accent);
}
:where(.app) :deep(:where(button, input, select, textarea)) {
  font: inherit;
  max-width: 100%;
}
:where(.app) :deep(:where(button, .button)) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  cursor: pointer;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-raised);
  color: var(--text);
  padding: 12px 18px;
  font-weight: 600;
  transition:
    background 0.15s,
    border-color 0.15s;
}
:where(.app) :deep(:where(button:hover, .button:hover)) {
  background: var(--accent-soft);
  border-color: var(--accent);
}
:where(.app) :deep(:where(button.primary, .button.primary)) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
:where(.app) :deep(:where(button:disabled)) {
  opacity: 0.45;
  cursor: not-allowed;
}
:where(.app) :deep(:where(input, select, textarea)) {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
}
:where(.app) :deep(:where(input[type="checkbox"], input[type="radio"])) {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}
:where(.app) :deep(:where(input::placeholder, textarea::placeholder)) {
  color: var(--muted);
  opacity: 0.8;
}
:where(.app) :deep(:where(label)) {
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: var(--muted);
}
:where(.app) :deep(:where(:focus-visible)) {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
:where(.app) :deep(:where(h1, h2, h3, p)) {
  margin-top: 0;
}
:where(.app) :deep(:where(h1)) {
  font-family: "Golos Text", sans-serif;
  font-size: clamp(30px, 4vw, 52px);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 1.1;
  margin-bottom: 18px;
  overflow-wrap: anywhere;
}
:where(.app) :deep(:where(h2)) {
  font-size: 24px;
  line-height: 1.3;
  font-weight: 600;
  margin-bottom: 20px;
}
:where(.app) :deep(:where(h3)) {
  font-size: 18px;
  font-weight: 600;
}
:where(.app) :deep(:where(p)) {
  max-width: 80ch;
}
:where(.app) :deep(:where(.page-heading)) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  margin-bottom: 32px;
}
:where(.app) :deep(:where(.page-intro, .muted)) {
  color: var(--muted);
}
:where(.app) :deep(:where(.panel)) {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
:where(.app) :deep(:where(.filters)) {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 16px;
  margin: 24px 0;
}
:where(.app) :deep(:where(.table-wrap)) {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
:where(.app) :deep(:where(table)) {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 14px;
}
:where(.app) :deep(:where(th)) {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  background: var(--surface-raised);
  white-space: nowrap;
  padding: 16px 20px;
}
:where(.app) :deep(:where(td)) {
  padding: 19px 20px;
  border-top: 1px solid var(--line);
}
:where(.app) :deep(:where(tbody tr:hover)) {
  background: var(--surface-raised);
}
:where(.app) :deep(:where(td a)) {
  font-weight: 600;
}
:where(.app) :deep(:where(.error)) {
  color: var(--danger);
  background: var(--danger-soft);
  padding: 13px 16px;
  border-radius: 9px;
}
:where(.app) :deep(:where(.empty-state)) {
  padding: 48px 24px;
  text-align: center;
  color: var(--muted);
}
:where(.app) :deep(:where(code)) {
  background: var(--surface-raised);
  padding: 3px 6px;
  border-radius: 4px;
}
.skip-link {
  position: fixed;
  top: -80px;
  left: 24px;
  z-index: 100;
  background: var(--accent);
  color: var(--on-accent);
  padding: 14px;
}
.skip-link:focus {
  top: 8px;
}
.site-header {
  position: relative;
  z-index: 30;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.header-inner {
  max-width: 1540px;
  min-height: 104px;
  margin: auto;
  padding: 20px 40px;
  display: flex;
  align-items: center;
  gap: 36px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.city-mark {
  width: 72px;
  height: 50px;
  color: var(--text);
}
.brand > span {
  display: grid;
  gap: 3px;
}
.brand strong {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.055em;
  white-space: nowrap;
}
.brand small {
  font-size: 10px;
  color: var(--muted);
}
nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
}
nav a {
  padding: 10px 13px;
  border-radius: 10px;
  font-size: 14px;
  white-space: nowrap;
}
nav a.selected {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}
.theme-toggle {
  padding: 10px !important;
  border: 0 !important;
  background: transparent !important;
  border-radius: 50% !important;
}
.account-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 93px;
  padding: 10px 20px;
  border-radius: 10px;
  background: var(--text);
  color: var(--bg);
  font-size: 14px;
  max-width: 170px;
}
.account-link:hover {
  color: var(--bg) !important;
  background: var(--accent);
}
.account-link > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-link :deep(img) {
  width: 25px;
  height: 25px;
}
.menu-toggle {
  display: none !important;
}
main {
  min-height: calc(100vh - 230px);
  max-width: 1460px;
  margin: auto;
  padding: 50px 40px 72px;
}
main:focus {
  outline: none;
}
footer {
  max-width: 1460px;
  margin: auto;
  padding: 28px 40px 36px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  gap: 28px;
  color: var(--muted);
  font-size: 12px;
}
.footer-brand {
  color: var(--text);
  font-weight: 600;
}
.footer-brand span {
  display: block;
  color: var(--muted);
  font-size: 11px;
  font-weight: 400;
  margin-top: 5px;
}
.footer-links {
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
}
@media (max-width: 1250px) {
  .header-inner {
    gap: 20px;
    padding-inline: 28px;
  }
  .city-mark {
    width: 55px;
  }
  .brand strong {
    font-size: 18px;
  }
  nav a {
    padding: 9px 10px;
    font-size: 13px;
  }
  .header-actions {
    gap: 8px;
  }
}
@media (max-width: 1050px) {
  .header-inner {
    min-height: 88px;
  }
  .brand small {
    display: none;
  }
  .city-mark {
    width: 46px;
  }
  .brand {
    gap: 8px;
  }
  .brand strong {
    font-size: 16px;
  }
  nav {
    gap: 0;
  }
  nav a {
    padding: 9px 8px;
    font-size: 12px;
  }
  .account-link {
    min-width: 75px;
    padding: 9px 13px;
  }
  .header-inner {
    gap: 12px;
  }
  main {
    padding: 36px 28px 56px;
  }
  footer {
    padding-inline: 28px;
  }
}
@media (max-width: 820px) {
  .site-header {
    position: sticky;
    top: 0;
  }
  .header-inner {
    min-height: 76px;
    padding: 12px 20px;
    justify-content: space-between;
  }
  .brand strong {
    font-size: 17px;
  }
  .city-mark {
    height: 42px;
  }
  .menu-toggle {
    display: inline-flex !important;
    padding: 8px !important;
    background: transparent !important;
  }
  .header-actions {
    gap: 5px;
  }
  .theme-toggle {
    padding: 8px !important;
  }
  .account-link {
    padding: 8px 13px;
    font-size: 12px;
    min-width: 66px;
  }
  nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--surface);
    padding: 15px 20px 22px;
    border-bottom: 1px solid var(--line);
    box-shadow: var(--shadow);
    max-height: calc(100dvh - 76px);
    overflow: auto;
  }
  nav.open {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }
  nav a {
    font-size: 15px;
    padding: 13px;
  }
  main {
    padding: 30px 20px 48px;
  }
  .footer-links {
    gap: 18px;
  }
  footer {
    padding: 24px 20px;
    flex-direction: column;
    gap: 22px;
  }
  :where(.app) :deep(:where(h1)) {
    font-size: 34px;
  }
  :where(.app) :deep(:where(.page-heading)) {
    flex-wrap: wrap;
  }
  :where(.app) :deep(:where(th, td)) {
    padding: 14px;
  }
}
@media (max-width: 400px) {
  .city-mark {
    display: none;
  }
  .brand strong {
    font-size: 16px;
  }
  .header-inner {
    padding-inline: 16px;
  }
  .header-actions {
    gap: 2px;
  }
  main {
    padding-inline: 16px;
  }
  .account-link {
    max-width: 100px;
    padding: 8px 11px;
  }
  :where(.app) :deep(:where(h1)) {
    font-size: 29px;
  }
}
@media (max-width: 360px) {
  .header-inner {
    gap: 5px;
  }
  .account-link.is-signed-in {
    min-width: 0;
    max-width: none;
    padding: 8px;
  }
  .account-link.is-signed-in > span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  :global(html) {
    scroll-behavior: auto;
  }
  :where(.app) :deep(:where(*)) {
    animation: none !important;
    transition: none !important;
  }
}
</style>
