<script setup lang="ts">
import { hasLevelPage } from "#shared/utils/rating";
const { data: catalog } = await useCatalog();
const page = ref(1),
  kind = ref("level"),
  search = ref("");
watch([kind, search], () => {
  page.value = 1;
});
const { data, error, status, refresh } = await useFetch("/api/changes", {
  query: { page, kind, search },
});
const labels: Record<string, string> = {
  level: "Уровни",
  "player-rating": "Рейтинг игроков",
  "district-rating": "Рейтинг районов",
};
function link(eventKind: string, id: number | null) {
  if (!id) return null;
  if (eventKind === "level")
    return catalog.value?.levels.some((l) => l.id === id && hasLevelPage(l))
      ? `/levels/${id}`
      : null;
  if (eventKind === "player-rating") return `/players/${id}`;
  if (eventKind === "district-rating")
    return catalog.value?.districts.some(
      (d) => d.id === id && (d.completionCount || d.legacyCompletionCount),
    )
      ? `/districts/${id}`
      : null;
  return null;
}
function icon(eventKind: string) {
  if (eventKind === "level" || eventKind === "threshold") return "list";
  if (eventKind.startsWith("record")) return "trophy";
  if (eventKind.startsWith("district")) return "map";
  if (eventKind.startsWith("player")) return "users";
  return "history";
}
const date = (value: string) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  });
const time = (value: string) =>
  new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
const groups = computed(() => {
  const result: { date: string; events: NonNullable<typeof data.value> }[] = [];
  for (const event of data.value ?? []) {
    const day = date(event.createdAt);
    const last = result[result.length - 1];
    if (last?.date === day) last.events.push(event);
    else result.push({ date: day, events: [event] });
  }
  return result;
});
useHead({ title: "История изменений · СПб Demonlist" });
</script>
<template>
  <section class="changelog-page">
    <header class="page-heading">
      <div>
        <h1>История изменений</h1>
        <p class="page-intro">
          Перестановки уровней и изменения мест игроков и районов.
        </p>
      </div>
      <span class="timezone"><AppIcon name="clock" />Время московское</span>
    </header>
    <div class="history-toolbar">
      <label
        >Тип события<select v-model="kind">
          <option v-for="(name, key) in labels" :key="key" :value="key">
            {{ name }}
          </option>
        </select></label
      >
      <label
        >Поиск<input
          v-model="search"
          type="search"
          placeholder="Уровень, игрок или район"
      /></label>
    </div>
    <div v-if="error" class="error">
      Не удалось загрузить историю.
      <button @click="refresh()">Повторить</button>
    </div>
    <div class="timeline" :aria-busy="status === 'pending'">
      <section v-for="group in groups" :key="group.date" class="day-group">
        <h2>{{ group.date }}</h2>
        <ol>
          <li
            v-for="c in group.events"
            :key="c.id"
            class="event"
            :class="{ 'needs-review': c.kind === 'record-review' }"
          >
            <span class="event-icon"><AppIcon :name="icon(c.kind)" /></span>
            <div class="event-content">
              <div class="event-meta">
                <span>{{ labels[c.kind] || c.kind }}</span
                ><time :datetime="c.createdAt">{{ time(c.createdAt) }}</time>
              </div>
              <p class="event-title">
                <NuxtLink
                  v-if="link(c.kind, c.entityId)"
                  :to="link(c.kind, c.entityId)!"
                  >{{ c.title }}</NuxtLink
                ><span v-else>{{ c.title }}</span>
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>
    <div v-if="!data?.length && !error" class="empty-history panel">
      <AppIcon name="history" />
      <h2>
        {{ status === "pending" ? "Загружаем историю" : "Событий пока нет" }}
      </h2>
      <p v-if="status !== 'pending'">
        Попробуйте другой запрос или тип события.
      </p>
    </div>
    <nav class="history-pagination" aria-label="Страницы истории">
      <button :disabled="page === 1 || status === 'pending'" @click="page--">
        <AppIcon name="chevron" />Назад</button
      ><span>Страница {{ page }}</span
      ><button
        :disabled="(data?.length ?? 0) < 50 || status === 'pending'"
        @click="page++"
      >
        Далее<AppIcon name="chevron" />
      </button>
    </nav>
  </section>
</template>
<style scoped lang="scss">
.page-heading h1 {
  margin-bottom: 12px;
}
.timezone {
  color: var(--muted);
  display: inline-flex;
  gap: 7px;
  align-items: center;
  font-size: 15px;
  white-space: nowrap;
  svg {
    width: 15px;
    height: 15px;
  }
}
.history-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  justify-content: space-between;
  padding: 23px 0;
  margin: 20px 0 30px;
  border-bottom: 1px solid var(--line);
  label {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--muted);
    font-size: 14px;
  }
  select {
    min-width: 220px;
    color: var(--text);
  }
  p {
    color: var(--muted);
    margin: 0 0 10px;
    font-size: 14px;
  }
}
.timeline {
  max-width: 970px;
}
.day-group {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 28px;
  h2 {
    font-family: inherit;
    font-weight: 500;
    font-size: 15px;
    color: var(--muted);
    margin: 10px 0 0;
  }
  ol {
    list-style: none;
    padding: 0;
    margin: 0 0 25px;
  }
}
.event {
  display: flex;
  position: relative;
  gap: 18px;
  padding-bottom: 28px;
  &::before {
    content: "";
    position: absolute;
    top: 34px;
    bottom: 0;
    left: 16px;
    width: 1px;
    background: var(--line);
  }
  &:last-child::before {
    display: none;
  }
}
.event-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--accent);
  background: var(--surface);
  svg {
    width: 16px;
    height: 16px;
  }
}
.needs-review .event-icon {
  color: var(--warm);
}
.event-content {
  flex: 1;
  min-width: 0;
  padding: 4px 0 0;
}
.event-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  font-size: 14px;
  color: var(--muted);
  time {
    font-variant-numeric: tabular-nums;
  }
}
.event-title {
  margin: 9px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 16px;
  line-height: 1.65;
  a {
    color: var(--text);
    text-decoration: none;
    &:hover {
      color: var(--accent);
    }
  }
}
.event details {
  margin-top: 12px;
  summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 14px;
    width: fit-content;
    &:hover {
      color: var(--text);
    }
  }
}
.change-data {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
  > div {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    min-width: 0;
  }
  span {
    font-size: 14px;
    color: var(--muted);
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.6;
    margin: 10px 0 0;
  }
}
.empty-history {
  padding: 45px 25px;
  text-align: center;
  > svg {
    width: 28px;
    height: 28px;
    color: var(--muted);
  }
  h2 {
    font-size: 16px;
  }
  p {
    color: var(--muted);
    font-size: 15px;
  }
  button {
    margin-top: 15px;
  }
}
.history-pagination {
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 22px;
  margin-top: 10px;
  span {
    color: var(--muted);
    font-size: 14px;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    svg {
      width: 14px;
      height: 14px;
    }
    &:first-child svg {
      transform: rotate(180deg);
    }
  }
}
@media (max-width: 750px) {
  .day-group {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .history-toolbar {
    flex-wrap: wrap;
    gap: 12px;
    p {
      margin: 0;
    }
  }
  .day-group h2 {
    color: var(--text);
    margin-top: 5px;
  }
}
@media (max-width: 450px) {
  .history-toolbar label {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .event {
    gap: 12px;
  }
  .change-data {
    grid-template-columns: 1fr;
  }
}
</style>
