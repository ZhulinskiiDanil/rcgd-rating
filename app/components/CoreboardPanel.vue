<script setup lang="ts">
import type { Level } from "#shared/types/domain";

const props = defineProps<{
  levels: Level[];
  canEdit: boolean;
  canSync: boolean;
  busy: boolean;
  notice: string;
  error: string;
}>();
const emit = defineEmits<{ sync: [] }>();
const { open } = useEntityEditor();
const search = ref("");
const filter = ref("all");
const searchId = useId();
const filterId = useId();
const hasThresholds = (level: Level) =>
  level.listPercent !== null &&
  level.endPercent !== null &&
  level.listPercent > 0 &&
  level.listPercent < level.endPercent &&
  level.endPercent <= 100;
const top = computed(() =>
  props.levels
    .filter(
      (level) =>
        !level.deletedAt &&
        !level.listExcluded &&
        level.globalRank &&
        level.globalRank <= 150,
    )
    .sort((a, b) => a.globalRank! - b.globalRank!),
);
const missing = computed(
  () => top.value.filter((level) => !hasThresholds(level)).length,
);
const manual = computed(
  () => top.value.filter((level) => level.thresholdSource === "manual").length,
);
const visible = computed(() =>
  top.value.filter((level) => {
    const term = search.value.trim().toLocaleLowerCase("ru");
    return (
      (!term ||
        `${level.name} ${level.gdlId ?? ""} ${level.globalRank}`
          .toLocaleLowerCase("ru")
          .includes(term)) &&
      (filter.value !== "missing" || !hasThresholds(level)) &&
      (filter.value !== "manual" || level.thresholdSource === "manual")
    );
  }),
);
function edit(level?: Level) {
  open({
    resource: "levels",
    entityId: level?.id,
    title: level ? `Проценты — ${level.name}` : "Добавить уровень в каталог",
    defaults: { thresholdSource: "manual" },
  });
}
</script>

<template>
  <section class="coreboard-panel" aria-label="Проценты Coreboard">
    <div class="source-heading">
      <div>
        <p>
          Проценты для {{ top.length }} уровней глобального топ-150. Без
          процентов: <strong>{{ missing }}</strong
          >. Ручных: {{ manual }}.
        </p>
        <p class="explanation">
          t — минимальный прогресс, T — последняя возможность умереть. Ручные
          значения действуют на этом сайте и сохраняются при обновлении
          источника.
        </p>
        <a
          href="https://coreboard.pythonanywhere.com/main/levels"
          target="_blank"
          rel="noopener noreferrer"
          >Открыть Coreboard</a
        >
      </div>
      <div class="source-actions">
        <button
          v-if="canSync"
          type="button"
          :disabled="busy"
          @click="emit('sync')"
        >
          {{ busy ? "Источники обновляются…" : "Обновить из источников" }}
        </button>
        <button v-if="canEdit" type="button" class="primary" @click="edit()">
          <AppIcon name="plus" :size="16" />Добавить уровень
        </button>
      </div>
    </div>
    <p v-if="notice" class="feedback" role="status">{{ notice }}</p>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <div class="source-filters">
      <label :for="searchId"
        >Поиск<input
          :id="searchId"
          v-model="search"
          type="search"
          placeholder="Название, позиция или ID глобала"
      /></label>
      <label :for="filterId"
        >Показывать<select :id="filterId" v-model="filter">
          <option value="all">Все уровни</option>
          <option value="missing">Без процентов</option>
          <option value="manual">Ручные проценты</option>
        </select></label
      >
      <span aria-live="polite">Найдено: {{ visible.length }}</span>
    </div>
    <div
      class="threshold-table"
      tabindex="0"
      role="region"
      aria-label="Таблица процентов уровней"
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Глобал</th>
            <th scope="col">Уровень</th>
            <th scope="col">t</th>
            <th scope="col">T</th>
            <th scope="col">Источник</th>
            <th v-if="canEdit" scope="col">
              <span class="sr-only">Редактировать</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="level in visible"
            :key="level.id"
            :class="{ missing: !hasThresholds(level) }"
          >
            <td class="number">#{{ level.globalRank }}</td>
            <th scope="row">
              <NuxtLink :to="`/levels/${level.id}`">{{ level.name }}</NuxtLink
              ><small v-if="level.gdlId"
                >ID Global Demonlist: {{ level.gdlId }}</small
              >
            </th>
            <td class="number">{{ level.listPercent ?? "—" }}</td>
            <td class="number">{{ level.endPercent ?? "—" }}</td>
            <td>
              <span class="source-label">{{
                !hasThresholds(level)
                  ? "Нет данных"
                  : level.thresholdSource === "manual"
                    ? "Ручные"
                    : "Coreboard"
              }}</span>
            </td>
            <td v-if="canEdit">
              <button
                type="button"
                :aria-label="`Изменить проценты ${level.name}`"
                @click="edit(level)"
              >
                Изменить
              </button>
            </td>
          </tr>
          <tr v-if="!visible.length">
            <td :colspan="canEdit ? 6 : 5" class="empty-state">
              По этому фильтру уровней нет.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped lang="scss">
.coreboard-panel {
  min-width: 0;
}
.source-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 28px;
  p {
    margin: 0 0 12px;
    font-size: 15px;
    line-height: 1.7;
    max-width: 74ch;
  }
  .explanation {
    color: var(--muted);
  }
  a {
    font-size: 14px;
    color: var(--accent);
    text-underline-offset: 3px;
  }
}
.source-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: 10px;
  max-width: 310px;
  flex-shrink: 0;
  button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
}
.source-filters {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
  label {
    display: grid;
    gap: 8px;
    color: var(--muted);
    font-size: 14px;
    &:first-child {
      flex: 1 1 270px;
    }
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
  }
  > span {
    color: var(--muted);
    padding-bottom: 13px;
    font-size: 14px;
  }
}
.threshold-table {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th,
  td {
    padding: 15px 18px;
    border-bottom: 1px solid var(--line);
  }
  thead th {
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  tbody {
    th {
      min-width: 200px;
      font-size: 15px;
      font-weight: 500;
    }
    td {
      font-size: 14px;
    }
    tr:last-child th,
    tr:last-child td {
      border-bottom: 0;
    }
  }
  a {
    text-decoration: none;
    color: var(--text);
    &:hover {
      color: var(--accent);
    }
  }
  small {
    display: block;
    color: var(--muted);
    margin-top: 5px;
    font-size: 12px;
    font-weight: 400;
  }
  button {
    white-space: nowrap;
    font-size: 13px;
  }
}
.number {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.source-label {
  white-space: nowrap;
  color: var(--muted);
}
.missing .source-label {
  color: var(--warm);
}
.feedback {
  border-left: 2px solid var(--accent);
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  &.error {
    border-color: var(--danger);
    color: var(--danger);
  }
}
.empty-state {
  padding: 30px 18px !important;
  color: var(--muted);
}
@media (max-width: 800px) {
  .source-heading {
    flex-direction: column;
    gap: 18px;
  }
  .source-actions {
    max-width: none;
    justify-content: start;
  }
  .threshold-table th,
  .threshold-table td {
    padding: 13px;
  }
}
</style>
