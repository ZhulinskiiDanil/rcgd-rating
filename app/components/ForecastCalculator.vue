<script setup lang="ts">
import { forecastRating, type ForecastEntity } from "#shared/utils/forecast";
import {
  effectivePercent,
  hypotheticalPosition,
  completedLevels,
  isCurrentLevel,
  progressPosition,
  withinListBoundary,
  listBoundary,
} from "#shared/utils/rating";
import { formatScore } from "#shared/utils/presentation";
const props = defineProps<{ entityType: ForecastEntity; entityId: number }>();
const { data } = await useCatalog();
const boundary = computed(() => listBoundary(data.value?.levels ?? []));
type Plan = {
  key: number;
  levelId: number | "";
  percent: number;
  listPercent?: number;
  endPercent?: number;
};
const plans = ref<Plan[]>([{ key: 1, levelId: "", percent: 100 }]);
let nextKey = 2;
const search = ref("");
watch(
  () => [props.entityType, props.entityId],
  () => {
    plans.value = [{ key: nextKey++, levelId: "", percent: 100 }];
  },
);
const candidates = computed(() =>
  (data.value?.levels ?? [])
    .filter(
      (l) =>
        !l.listExcluded &&
        !l.deletedAt &&
        withinListBoundary(l, data.value!.levels, boundary.value) &&
        l.status !== "legacy" &&
        (l.globalRank !== null || l.manualPosition !== null) &&
        (l.name.toLowerCase().includes(search.value.trim().toLowerCase()) ||
          plans.value.some((p) => p.levelId === l.id)),
    )
    .sort(
      (a, b) =>
        (a.globalRank ?? a.manualPosition ?? Infinity) -
        (b.globalRank ?? b.manualPosition ?? Infinity),
    ),
);
const source = computed(() =>
  data.value
    ? {
        ...data.value,
        records: data.value.records.map((r) => ({ ...r, note: "" })),
      }
    : null,
);
const result = computed(() => {
  if (!source.value || (props.entityType === "districts" && !props.entityId))
    return null;
  try {
    return {
      value: forecastRating(
        source.value,
        props.entityType,
        props.entityId,
        plans.value
          .filter((p) => p.levelId !== "")
          .map((p) => ({
            levelId: Number(p.levelId),
            percent: props.entityType === "districts" ? 100 : Number(p.percent),
            ...(props.entityType === "players" && p.percent < 100
              ? { listPercent: p.listPercent, endPercent: p.endPercent }
              : {}),
          })),
      ),
      error: "",
    };
  } catch (cause) {
    return {
      value: null,
      error:
        cause instanceof Error
          ? cause.message
          : "Не удалось рассчитать сценарий.",
    };
  }
});
const transitions = computed(
  () =>
    result.value?.value?.changes.filter((c) => c.fromTier !== c.toTier) ?? [],
);
const tierName = (tier: string) =>
  ({
    main: "Main list",
    extended: "Extended list",
    legacy: "Legacy list",
    catalog: "Вне топа-150",
  })[tier] || tier;
const rankLabel = (rank: number | null) => (rank ? `#${rank}` : "Без места");
function selectLevel(plan: Plan) {
  const level = data.value?.levels.find((level) => level.id === plan.levelId);
  plan.listPercent = level?.listPercent ?? 50;
  plan.endPercent = level?.endPercent ?? 100;
}
function note(plan: Plan) {
  if (!source.value || !plan.levelId) return "";
  const level = source.value.levels.find((l) => l.id === plan.levelId)!;
  if (props.entityType === "players") {
    const existing = source.value.records.find(
      (r) => r.playerId === props.entityId && r.levelId === plan.levelId,
    );
    if (existing && effectivePercent(existing) >= plan.percent)
      return "Этот результат уже достигнут; учитывается лучший.";
    if (plan.percent < 100) {
      const completed = result.value?.value
        ? result.value.value.levels
            .filter(isCurrentLevel)
            .sort((a, b) => a.localRank! - b.localRank!)
        : completedLevels(source.value);
      const h = hypotheticalPosition(level, completed);
      if (level.globalRank === null || level.globalRank > 150)
        return "Прогресс вне глобального топа-150 не учитывается.";
      if (
        h === null ||
        progressPosition(
          h,
          plan.percent,
          plan.listPercent ?? level.listPercent,
          plan.endPercent ?? level.endPercent,
        ) === null
      )
        return "Прогресс ниже лист-процента, нет данных процентов или условная позиция хуже 150.";
    }
  }
  return !level.localRank && plan.percent === 100
    ? "Первое прохождение в регионе может сдвинуть СПб-лист."
    : "";
}
</script>
<template>
  <section class="forecast">
    <div class="forecast-heading">
      <h2>Будущий рейтинг</h2>
      <p class="muted">
        {{
          entityType === "players"
            ? "Добавь запланированные прохождения и прогрессы."
            : "Добавь запланированные прохождения жителей района. Прогрессы не участвуют в рейтинге районов."
        }}
        Все позиции пересчитаются с учётом изменений СПб-листа.
      </p>
    </div>
    <div class="plan-editor panel">
      <label class="search"
        >Поиск уровня<input
          v-model="search"
          type="search"
          placeholder="Название из глобала или собственных уровней"
      /></label>
      <div v-for="(plan, i) in plans" :key="plan.key" class="plan-row">
        <label
          >Уровень {{ i + 1
          }}<select v-model="plan.levelId" @change="selectLevel(plan)">
            <option value="">Выбери уровень</option>
            <option
              v-for="level in candidates"
              :key="level.id"
              :value="level.id"
            >
              {{ level.name }} ·
              {{
                level.globalRank
                  ? "#" + level.globalRank + " Global"
                  : "Собственный уровень"
              }}
            </option>
          </select></label
        ><label v-if="entityType === 'players'" class="percent"
          >Результат, %<input
            v-model.number="plan.percent"
            type="number"
            min="1"
            max="100"
            step="1" /></label
        ><button
          type="button"
          :aria-label="`Убрать результат ${i + 1}`"
          @click="plans.splice(i, 1)"
        >
          <AppIcon name="close" />
        </button>
        <div
          v-if="entityType === 'players' && plan.levelId && plan.percent < 100"
          class="threshold-controls"
        >
          <label
            >Лист-процент t<input
              v-model.number="plan.listPercent"
              type="number"
              min="0.01"
              max="99.99"
              step="0.01" /></label
          ><label
            >Конец уровня T<input
              v-model.number="plan.endPercent"
              type="number"
              min="0.01"
              max="100"
              step="0.01" /></label
          ><span>Пороги изменяются только в этом сценарии.</span>
        </div>
        <p v-if="note(plan)" class="plan-note">{{ note(plan) }}</p>
      </div>
      <button
        type="button"
        @click="plans.push({ key: nextKey++, levelId: '', percent: 100 })"
      >
        <AppIcon name="plus" />Ещё результат
      </button>
    </div>
    <p v-if="result?.error" class="error" role="alert">{{ result.error }}</p>
    <template v-if="result?.value"
      ><div class="forecast-result" aria-live="polite">
        <div>
          <span>Место сейчас → после</span
          ><strong
            >{{ rankLabel(result.value.before.rank) }} →
            {{ rankLabel(result.value.after.rank) }}</strong
          >
        </div>
        <div>
          <span>Баллы сейчас → после</span
          ><strong
            >{{ formatScore(result.value.before.score) }} →
            {{ formatScore(result.value.after.score) }}</strong
          >
        </div>
      </div>
      <p class="muted">
        Сценарий не сохраняет рекорды. Остальные игроки сохраняют свои
        достижения; их баллы пересчитываются при перестановке уровней.
      </p>
      <RatingBreakdown :rating="result.value.after" :levels="data?.levels" />
      <div v-if="result.value.changes.length" class="list-impact">
        <h3>Изменения СПб-листа: {{ result.value.changes.length }}</h3>
        <ul>
          <li v-for="change in transitions" :key="change.id">
            <strong>{{ change.name }}</strong
            >: {{ tierName(change.fromTier) }} → {{ tierName(change.toTier)
            }}<span v-if="change.to"> · #{{ change.to }}</span>
          </li>
        </ul>
        <p v-if="!transitions.length">
          Поменяются позиции уровней внутри текущих разделов.
        </p>
      </div></template
    >
  </section>
</template>
<style scoped lang="scss">
.threshold-controls {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: end;
  label {
    flex: 1;
    min-width: 140px;
  }
  span {
    font-size: 13px;
    color: var(--muted);
  }
}
.forecast {
  margin-top: 36px;
}
.forecast-heading h2 {
  margin-bottom: 10px;
}
.plan-editor {
  padding: 24px;
  margin-bottom: 24px;
}
.search {
  margin-bottom: 20px;
}
.plan-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px auto;
  gap: 14px;
  align-items: end;
  margin-bottom: 16px;
  label:first-child {
    min-width: 0;
  }
  > button {
    padding: 13px;
  }
  .plan-note {
    grid-column: 1/-1;
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  &:has(label:only-of-type) {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
.forecast-result {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 60px;
  margin: 26px 0;
  div {
    display: grid;
    gap: 8px;
  }
  span {
    color: var(--muted);
    font-size: 13px;
  }
  strong {
    font-size: clamp(22px, 3vw, 36px);
    letter-spacing: -0.04em;
  }
}
.list-impact {
  margin-top: 24px;
  padding: 20px;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  li {
    margin: 8px 0;
  }
}
@media (max-width: 540px) {
  .plan-editor {
    padding: 18px;
  }
  .plan-row {
    grid-template-columns: minmax(0, 1fr) auto;
    label:first-child {
      grid-column: 1/-1;
    }
    .percent {
      width: 120px;
    }
    > button {
      justify-self: end;
    }
  }
}
</style>
