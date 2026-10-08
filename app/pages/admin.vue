<script setup lang="ts">
import type { EntityResource } from "~/types/admin";
import type { Permission } from "#shared/types/domain";
const { data: session } = await useAccount();
const user = computed(() => session.value?.user);
if (!user.value) await navigateTo("/login");
else if (
  !user.value.headAdmin &&
  !user.value.seniorAdmin &&
  !user.value.permissions.length
)
  throw createError({
    statusCode: 403,
    statusMessage: "Нет прав на администрирование",
  });
const { data, refresh, error: loadError } = await useFetch("/api/admin");
const { viewAsUser } = useAdminView();
const can = (p: Permission) =>
  !!user.value?.headAdmin || !!user.value?.permissions.includes(p);
const tabs = computed(() => [
  ...(can("players:write") ? [{ key: "players", label: "Игроки" }] : []),
  ...(can("levels:write") ? [{ key: "levels", label: "Уровни" }] : []),
  ...(can("levels:write") || can("sync:run")
    ? [{ key: "coreboard", label: "Coreboard" }]
    : []),
  ...(can("records:write") ? [{ key: "records", label: "Рекорды" }] : []),
  ...(can("districts:write")
    ? [
        { key: "districts", label: "Районы" },
        { key: "extras", label: "Достижения районов" },
      ]
    : []),
  ...(can("news:write") ? [{ key: "news", label: "Новости" }] : []),
  ...(user.value?.headAdmin
    ? [{ key: "accounts", label: "Аккаунты и права" }]
    : []),
  ...(!user.value?.headAdmin && user.value?.seniorAdmin
    ? [{ key: "recovery", label: "Восстановление аккаунтов" }]
    : []),
  ...(user.value?.headAdmin || user.value?.seniorAdmin
    ? [{ key: "audit", label: "Действия администраторов" }]
    : []),
  ...(can("sync:run") ? [{ key: "sync", label: "Синхронизация" }] : []),
]);
const tab = ref(tabs.value[0]?.key || "");
const busy = ref(false),
  notice = ref(""),
  syncError = ref("");
const dateBusy = ref(false),
  dateNotice = ref(""),
  dateError = ref("");
const schemas = useAdminSchemas(data);
const editor = computed(() =>
  ["sync", "coreboard", "audit", "recovery"].includes(tab.value)
    ? undefined
    : schemas.value[tab.value as EntityResource],
);
const sectionInfo: Record<string, string> = {
  players: "Профили игроков, районы и привязки к глобальному листу.",
  levels: "Обложки, видео и оригинальные верификации местными игроками.",
  records:
    "Ручные и импортированные достижения. Только активные рекорды входят в рейтинг.",
  districts: "Районы Санкт-Петербурга и Ленинградской области.",
  extras:
    "Подтверждённые прохождения района без привязки к конкретному игроку.",
  news: "Новости сообщества для публичной ленты изменений.",
  accounts: "Аккаунты пользователей и доступ к разделам сайта.",
  recovery:
    "Выдача временного пароля с обязательной сменой при следующем входе.",
  audit: "Изменения данных и действия администрации. Время по Москве.",
  coreboard:
    "Листовые и эндинг-проценты, ручные значения и новые уровни глобального топ-150.",
  sync: "Обновления глобальных позиций, процентов и принятых рекордов.",
};
const runLabels: Record<string, string> = {
  success: "Завершено",
  partial: "С замечаниями",
  failed: "Ошибка",
  running: "Выполняется",
};
function formatRunDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}
function summarizeRun(value: string | null) {
  if (!value) return "Ожидаем результат обновления…";
  try {
    const result = JSON.parse(value);
    return `Уровней: ${result.levels ?? 0}. Игроков: ${result.players ?? 0}. ${Array.isArray(result.warnings) ? result.warnings.join(" · ") : ""}`;
  } catch {
    return value;
  }
}
useHead({ title: "Администрирование — СПб Demonlist" });
async function saved() {
  await refresh();
  await refreshNuxtData("catalog");
  if (tab.value === "accounts") await refreshNuxtData("account");
}
async function sync() {
  if (busy.value || dateBusy.value) return;
  busy.value = true;
  notice.value = "";
  syncError.value = "";
  try {
    const result = await $fetch("/api/admin/sync", { method: "POST" });
    notice.value = `Обновлено уровней: ${result.levels}, игроков: ${result.players}. ${result.warnings.join(" · ")}`;
    await saved();
  } catch (e: any) {
    syncError.value = e.data?.message || "Ошибка синхронизации";
    await refresh();
  } finally {
    busy.value = false;
  }
}
async function syncDates() {
  if (busy.value || dateBusy.value) return;
  dateBusy.value = true;
  dateNotice.value = "";
  dateError.value = "";
  try {
    const result = await $fetch("/api/admin/sync-video-dates", {
      method: "POST",
    });
    dateNotice.value = `Проверено видео: ${result.checked}. Обновлено записей: ${result.updated}. Без доступной даты: ${result.unavailable}.${result.deferred ? ` Осталось ${result.deferred} видео — нажми ещё раз, чтобы обработать следующий пакет.` : ""}`;
    await saved();
  } catch (error: any) {
    dateError.value = error.data?.message || "Не удалось обновить даты видео";
  } finally {
    dateBusy.value = false;
  }
}
</script>
<template>
  <section class="admin-page">
    <div class="page-heading">
      <div>
        <h1>Управление листом</h1>
        <p class="page-intro">Данные сообщества и инструменты администрации.</p>
      </div>
      <NuxtLink to="/account" class="admin-identity"
        ><AppIcon name="shield" :size="18" /><span
          >{{ user?.login
          }}<small>{{
            user?.headAdmin
              ? "Главный администратор"
              : user?.seniorAdmin
                ? "Старший администратор"
                : "Администрация"
          }}</small></span
        ></NuxtLink
      >
    </div>
    <label class="user-view"
      ><input v-model="viewAsUser" type="checkbox" /> Показывать сайт от лица
      пользователя</label
    >
    <div v-if="loadError" class="load-error" role="alert">
      <p>Не удалось загрузить админку.</p>
      <button @click="refresh()">Попробовать снова</button>
    </div>
    <nav class="admin-nav" aria-label="Разделы админки">
      <button
        v-for="t in tabs"
        :key="t.key"
        :class="{ active: tab === t.key }"
        :aria-pressed="tab === t.key"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </nav>
    <div class="section-intro">
      <h2>{{ tabs.find((t) => t.key === tab)?.label }}</h2>
      <p>{{ sectionInfo[tab] }}</p>
    </div>
    <AdminEditor
      v-if="editor"
      :resource="tab as EntityResource"
      :fields="editor.fields"
      :rows="editor.rows"
      :columns="editor.columns"
      :allow-create="editor.create"
      @saved="saved"
    />
    <AdminAuditLog v-if="tab === 'audit'" />
    <AdminAccountRecovery
      v-if="tab === 'recovery'"
      :accounts="data?.accounts ?? []"
    />
    <CoreboardPanel
      v-if="tab === 'coreboard'"
      :levels="data?.levels ?? []"
      :can-edit="can('levels:write')"
      :can-sync="can('sync:run')"
      :busy="busy || dateBusy || !!data?.pendingSync"
      :notice="notice"
      :error="syncError"
      @sync="sync"
    />
    <div v-if="tab === 'sync'" class="sync-layout">
      <section class="sync-settings panel">
        <div class="sync-heading">
          <AppIcon name="globe" :size="23" />
          <h3>Обновление источников</h3>
        </div>
        <span class="schedule"
          ><AppIcon name="clock" :size="15" /> Автоматически каждый час</span
        >
        <p>
          Позиции уровней и принятые рекорды приходят из Demonlist. Листовые и
          эндинг-проценты — из Coreboard.
        </p>
        <p>
          Импортируются рекорды привязанных игроков. Ручные решения сохраняются,
          а исчезнувшие из источника рекорды остаются активными.
        </p>
        <div class="sync-actions">
          <button
            class="primary"
            :disabled="busy || dateBusy || data?.pendingSync"
            @click="sync"
          >
            <AppIcon name="history" :size="16" />{{
              busy || data?.pendingSync
                ? "Синхронизация выполняется…"
                : "Обновить сейчас"
            }}</button
          ><button @click="refresh()">Обновить статус</button>
        </div>
        <p class="sync-note">
          Публичный API Demonlist обновляет кеш примерно раз в час.
        </p>
        <p v-if="notice" class="sync-result" role="status">{{ notice }}</p>
        <p v-if="syncError" class="error" role="alert">{{ syncError }}</p>
        <div class="date-sync">
          <h3>Даты видео</h3>
          <p>
            Обновляет даты прохождений по видео YouTube. Даты, указанные
            вручную, сохраняются. Один запуск проверяет до 60 видео.
          </p>
          <button
            type="button"
            :disabled="dateBusy || busy || data?.pendingSync"
            @click="syncDates"
          >
            {{
              dateBusy ? "Проверяем даты видео…" : "Синхронизировать даты видео"
            }}
          </button>
          <p v-if="dateNotice" class="sync-result" role="status">
            {{ dateNotice }}
          </p>
          <p v-if="dateError" class="error" role="alert">{{ dateError }}</p>
        </div>
      </section>
      <section class="sync-history panel">
        <div class="history-heading">
          <h3>Последние запуски</h3>
          <span>Время по Москве</span>
        </div>
        <div class="runs">
          <article v-for="run in data?.syncRuns" :key="run.id">
            <div class="run-heading">
              <strong :class="['run-status', run.status]"
                ><span></span>{{ runLabels[run.status] || run.status }}</strong
              ><time :datetime="run.startedAt">{{
                formatRunDate(run.startedAt)
              }}</time>
            </div>
            <p :class="{ 'run-error': run.error }">
              {{ run.error || summarizeRun(run.summary) }}
            </p>
          </article>
          <p v-if="!data?.syncRuns.length" class="empty-runs">
            Здесь появятся результаты первого обновления.
          </p>
        </div>
      </section>
    </div>
  </section>
</template>
<style scoped lang="scss">
.admin-page {
  min-width: 0;
}
.user-view {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  input {
    width: auto;
  }
}
.page-heading {
  margin-bottom: 30px;
}
.admin-identity {
  display: flex;
  gap: 11px;
  align-items: center;
  text-decoration: none;
  color: var(--text);
  font-size: 14px;
  svg {
    color: var(--warm);
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 14px;
    margin-top: 2px;
  }
}
.admin-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 13px;
  margin-bottom: 28px;
  button {
    border-color: transparent;
    background: transparent;
    font-size: 14px;
    padding: 10px 14px;
    color: var(--muted);
    &:hover {
      color: var(--text);
      background: var(--surface);
    }
    &.active {
      color: var(--accent);
      background: var(--surface-raised);
      border-color: var(--line);
    }
  }
}
.section-intro {
  margin-bottom: 24px;
  h2 {
    font-size: 19px;
    margin: 0 0 10px;
  }
  p {
    font-size: 14px;
    color: var(--muted);
    margin: 0;
    max-width: 74ch;
    line-height: 1.6;
  }
}
.load-error {
  border: 1px solid var(--danger);
  border-radius: 9px;
  padding: 15px 20px;
  display: flex;
  gap: 18px;
  align-items: center;
  margin-bottom: 20px;
  p {
    margin: 0;
    color: var(--danger);
  }
}
.sync-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.12fr);
  gap: 24px;
  align-items: start;
}
.sync-settings {
  padding: 28px;
  p {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.8;
  }
}
.sync-heading {
  display: flex;
  gap: 11px;
  align-items: center;
  color: var(--accent);
  h3 {
    font-size: 17px;
    color: var(--text);
    margin: 0;
  }
}
.schedule {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 22px 0 7px;
  font-size: 14px;
  color: var(--warm);
}
.sync-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 25px;
  button {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 14px;
  }
}
.sync-settings .sync-note {
  font-size: 14px;
  margin-top: 17px;
}
.sync-settings .sync-result {
  border-left: 2px solid var(--accent);
  padding-left: 12px;
  color: var(--text);
  overflow-wrap: anywhere;
}
.sync-settings .error {
  color: var(--danger);
  overflow-wrap: anywhere;
}
.date-sync {
  margin-top: 30px;
  padding-top: 25px;
  border-top: 1px solid var(--line);
  h3 {
    margin: 0;
    font-size: 17px;
  }
  button {
    font-size: 14px;
  }
}
.history-heading {
  padding: 22px 25px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  border-bottom: 1px solid var(--line);
  h3 {
    font-size: 15px;
    margin: 0;
  }
  span {
    color: var(--muted);
    font-size: 14px;
  }
}
.runs {
  max-height: 570px;
  overflow-y: auto;
  article {
    padding: 19px 25px;
    border-bottom: 1px solid var(--line);
    &:last-child {
      border-bottom: 0;
    }
    p {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.75;
      overflow-wrap: anywhere;
    }
    .run-error {
      color: var(--danger);
    }
  }
}
.run-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  time {
    color: var(--muted);
    font-size: 14px;
  }
}
.run-status {
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 500;
  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  &.success {
    color: var(--accent);
  }
  &.partial,
  &.running {
    color: var(--warm);
  }
  &.failed {
    color: var(--danger);
  }
}
.empty-runs {
  color: var(--muted);
  font-size: 14px;
  padding: 25px;
  margin: 0;
}
@media (max-width: 950px) {
  .sync-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .admin-nav {
    gap: 4px;
    button {
      padding: 9px 11px;
      font-size: 14px;
    }
  }
  .sync-settings {
    padding: 21px;
  }
  .sync-heading h3 {
    font-size: 15px;
  }
  .history-heading,
  .runs article {
    padding-inline: 20px;
  }
}
</style>
