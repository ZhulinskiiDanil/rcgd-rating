<script setup lang="ts">
import type { Level, Ranking } from "#shared/types/domain";
import { hasLevelPage } from "#shared/utils/rating";
import { formatScore, formatPosition } from "#shared/utils/presentation";
import type { Victor } from "#shared/utils/victors";
const props = defineProps<{
  rating: Ranking;
  levels?: Level[];
  victorsByLevel?: Record<number, Victor[]>;
}>();
const linkedLevels = computed(
  () =>
    new Set((props.levels ?? []).filter(hasLevelPage).map((level) => level.id)),
);
</script>
<template>
  <div class="breakdown panel">
    <div class="breakdown-heading">
      <div>
        <AppIcon name="trophy" /><span>Рейтинговый балл</span
        ><strong>{{ formatScore(rating.score) }}</strong>
      </div>
      <NuxtLink to="/rules">Как считается</NuxtLink>
    </div>
    <p
      class="geometric-formula"
      aria-label="Геометрическое среднее шести результатов"
    >
      <sup>6</sup>√({{
        rating.top.map((result) => formatPosition(result.position)).join(" × ")
      }}) = {{ formatScore(rating.score) }}
    </p>
    <div class="table-wrap" tabindex="0">
      <table aria-label="Расчёт рейтинга по шести лучшим результатам">
        <thead>
          <tr>
            <th scope="col">Слот</th>
            <th scope="col">Результат</th>
            <th scope="col" class="number-col">Условная позиция</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in rating.top"
            :key="i"
            :class="{ 'empty-result': r.kind === 'empty' }"
          >
            <td>
              <span class="slot">{{ i + 1 }}</span>
            </td>
            <td>
              <div class="result">
                <NuxtLink
                  v-if="r.levelId && linkedLevels.has(r.levelId)"
                  :to="'/levels/' + r.levelId"
                  >{{ r.name }}</NuxtLink
                ><span v-else>{{ r.name }}</span
                ><span
                  v-if="r.kind !== 'empty'"
                  class="percent"
                  :class="{ progress: r.kind === 'progress' }"
                  ><AppIcon v-if="r.kind === 'completion'" name="check" />{{
                    formatPosition(r.percent)
                  }}%</span
                >
              </div>
              <VictorList
                v-if="victorsByLevel && r.levelId !== null"
                :victors="victorsByLevel[r.levelId] ?? []"
              />
            </td>
            <td class="number-col position">
              {{ formatPosition(r.position) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="breakdown-note">
      Меньше балл — выше место. Пустой слот учитывается как позиция 150.
    </p>
  </div>
</template>
<style scoped lang="scss">
.geometric-formula {
  margin: 0;
  padding: 0 24px 20px;
  font-size: 16px;
  overflow-wrap: anywhere;
  color: var(--text);
  sup {
    font-size: 11px;
  }
}
.breakdown {
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.table-wrap {
  border: 0;
  border-radius: 0;
}
.breakdown-heading {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  > div {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  :deep(svg) {
    color: var(--warm);
  }
  span {
    font-size: 15px;
    color: var(--muted);
  }
  strong {
    font-size: 28px;
    color: var(--accent);
    letter-spacing: -0.5px;
  }
  > a {
    font-size: 14px;
    white-space: nowrap;
  }
}
table {
  min-width: 430px;
  font-size: 15px;
  th {
    font-weight: 500;
    font-size: 13px;
    color: var(--muted);
  }
  th,
  td {
    padding: 20px 18px;
  }
  th:first-child,
  td:first-child {
    padding-left: 24px;
    width: 56px;
  }
  th:last-child,
  td:last-child {
    padding-right: 24px;
  }
}
.number-col {
  text-align: right;
  white-space: nowrap;
}
.slot {
  color: var(--muted);
  font-size: 14px;
}
.result {
  display: flex;
  gap: 12px;
  align-items: center;
  a {
    font-weight: 500;
    color: var(--text);
    text-decoration: none;
    &:hover {
      color: var(--accent);
    }
  }
}
.percent {
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  white-space: nowrap;
  :deep(svg) {
    width: 13px;
    height: 13px;
  }
  &.progress {
    color: var(--warm);
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--warm), transparent 65%);
    border-radius: 4px;
  }
}
.position {
  color: var(--muted);
}
.empty-result {
  color: var(--muted);
}
.breakdown-note {
  margin: 0;
  padding: 15px 24px;
  font-size: 14px;
  color: var(--muted);
}
@media (max-width: 520px) {
  .breakdown-heading {
    padding: 18px 16px;
    align-items: flex-start;
    > div {
      gap: 8px;
    }
    strong {
      font-size: 20px;
    }
  }
  .breakdown-note {
    padding: 14px 16px;
  }
}
</style>
