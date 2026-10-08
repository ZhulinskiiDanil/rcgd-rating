<script setup lang="ts">
interface AuditPage {
  items: {
    id: number;
    kind: string;
    title: string;
    actorId: number | null;
    actorName: string;
    entityId: number | null;
    createdAt: string;
    fields: string[];
  }[];
  total: number;
  page: number;
  actors: { id: number; name: string }[];
  kinds: string[];
}
const filters = reactive({ actorId: "", kind: "", search: "" });
const applied = ref({ ...filters });
const page = ref(1);
const { data, error, status, refresh } = await useFetch<AuditPage>(
  "/api/admin/audit",
  {
    query: computed(() => ({
      page: page.value,
      actorId: applied.value.actorId || undefined,
      kind: applied.value.kind || undefined,
      search: applied.value.search.trim() || undefined,
    })),
  },
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil((data.value?.total ?? 0) / 50)),
);
const kindLabels: Record<string, string> = {
  "admin-edit": "Изменение данных",
  account: "Настройки аккаунта",
  password: "Изменение пароля",
  "password-recovery": "Временный пароль",
  avatar: "Аватарка",
  record: "Рекорд",
  "record-delete": "Удаление рекорда",
  "record-date": "Дата прохождения",
  "player-delete": "Удаление игрока",
  "player-district": "Район игрока",
  "player-rating": "Рейтинг игрока",
  "district-rating": "Рейтинг района",
  "district-extra": "Достижение района",
  "extra-delete": "Удаление достижения района",
  level: "Позиция уровня",
  "level-exclusion": "Исключение уровня",
  "history-create": "Добавление события",
  "history-edit": "Редактирование события",
  "history-delete": "Удаление события",
  restore: "Восстановление записи",
  sync: "Синхронизация",
  "media-upload": "Загрузка изображения",
};
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});
function applyFilters() {
  page.value = 1;
  applied.value = { ...filters };
}
</script>

<template>
  <section class="admin-audit" aria-label="Лог действий администраторов">
    <form class="audit-filters" @submit.prevent="applyFilters">
      <label>
        Администратор
        <select v-model="filters.actorId">
          <option value="">Все администраторы</option>
          <option
            v-for="actor in data?.actors"
            :key="actor.id"
            :value="String(actor.id)"
          >
            {{ actor.name }}
          </option>
        </select>
      </label>
      <label>
        Действие
        <select v-model="filters.kind">
          <option value="">Все действия</option>
          <option v-for="kind in data?.kinds" :key="kind" :value="kind">
            {{ kindLabels[kind] || kind }}
          </option>
        </select>
      </label>
      <label class="audit-search">
        Поиск
        <input
          v-model="filters.search"
          type="search"
          placeholder="Описание действия"
          maxlength="200"
        />
      </label>
      <button type="submit" :disabled="status === 'pending'">Показать</button>
    </form>
    <div class="audit-toolbar">
      <p>Действий: {{ data?.total ?? 0 }}</p>
      <button type="button" :disabled="status === 'pending'" @click="refresh()">
        {{ status === "pending" ? "Загружаем…" : "Обновить" }}
      </button>
    </div>
    <p v-if="error" class="error" role="alert">
      Не удалось загрузить действия администраторов. Попробуйте обновить лог.
    </p>
    <div
      v-else-if="data?.items.length"
      class="table-wrap"
      tabindex="0"
      :aria-busy="status === 'pending'"
    >
      <table aria-label="Действия администраторов">
        <thead>
          <tr>
            <th scope="col">Дата, МСК</th>
            <th scope="col">Администратор</th>
            <th scope="col">Действие</th>
            <th scope="col">Изменённые поля</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="item.id">
            <td class="audit-date">
              <time :datetime="item.createdAt">{{
                dateFormatter.format(new Date(item.createdAt))
              }}</time>
            </td>
            <td class="audit-actor">
              {{ item.actorName || "Аккаунт удалён" }}
            </td>
            <td>{{ item.title }}</td>
            <td class="audit-fields">{{ item.fields.join(", ") || "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="status !== 'pending'" class="empty-audit">
      По выбранным условиям действий пока нет.
    </p>
    <nav
      v-if="pageCount > 1"
      class="audit-pagination"
      aria-label="Страницы лога"
    >
      <button
        type="button"
        :disabled="page <= 1 || status === 'pending'"
        @click="page--"
      >
        Назад
      </button>
      <span>{{ page }} / {{ pageCount }}</span>
      <button
        type="button"
        :disabled="page >= pageCount || status === 'pending'"
        @click="page++"
      >
        Далее
      </button>
    </nav>
  </section>
</template>

<style scoped lang="scss">
.audit-filters {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 14px;
  label {
    min-width: 180px;
    flex: 1;
  }
  .audit-search {
    flex: 1.5;
  }
}
.audit-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 22px 0 16px;
  p {
    color: var(--muted);
    margin: 0;
    font-size: 14px;
  }
}
table {
  min-width: 700px;
  font-size: 14px;
  th,
  td {
    padding: 16px;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-size: 13px;
    color: var(--muted);
    font-weight: 500;
  }
}
.audit-date {
  white-space: nowrap;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.audit-actor,
.audit-fields {
  overflow-wrap: anywhere;
}
.audit-fields {
  color: var(--muted);
  max-width: 240px;
}
.empty-audit {
  padding: 24px 0;
  color: var(--muted);
}
.audit-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 22px;
  span {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
}
@media (max-width: 540px) {
  .audit-filters label {
    min-width: 100%;
  }
}
</style>
