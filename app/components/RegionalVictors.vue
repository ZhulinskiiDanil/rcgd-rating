<script setup lang="ts">
import type { RegionalFirstVictor } from "#shared/utils/victors";
import { formatCompletionDate } from "#shared/utils/victors";
const props = defineProps<{ rows: RegionalFirstVictor[] }>();
const visibleRows = computed(() =>
  props.rows.filter((row) => row.hasCompletions),
);
</script>

<template>
  <section
    v-if="visibleRows.length"
    class="regional-victors"
    aria-labelledby="first-victors-heading"
  >
    <h2 id="first-victors-heading">Первые викторы</h2>
    <div v-for="row in visibleRows" :key="row.region" class="region-row">
      <div class="region-heading">
        <span class="region-label">{{ row.label }}</span
        ><small
          v-if="row.victors.some((victor) => victor.isFirstRk)"
          class="rk-victor"
          >Первый РК виктор</small
        >
      </div>
      <div class="region-result">
        <div class="victor-names" v-if="row.victors.length">
          <NuxtLink
            v-for="victor in row.victors"
            :key="victor.playerId"
            :to="`/players/${victor.playerId}`"
            >{{ victor.name }}</NuxtLink
          >
        </div>
        <template v-if="row.firstDate">
          <span v-if="!row.victors.length" class="unknown"
            >Виктор не указан</span
          >
          <div class="date-line">
            <time :datetime="row.firstDate">{{
              formatCompletionDate(row.firstDate)
            }}</time>
            <span
              v-if="
                row.victors.length > 1 &&
                row.victors.every(
                  (victor) => victor.achievedAt === row.firstDate,
                )
              "
              >одна дата прохождения</span
            >
          </div>
        </template>
        <span v-else-if="row.hasCompletions" class="unknown"
          >Дата первого прохождения не указана</span
        >
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.regional-victors {
  width: 100%;
  margin: 0 0 30px;
  h2 {
    margin: 0 0 16px;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
  }
}
.region-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--line);
  &:last-child {
    border-bottom: 1px solid var(--line);
  }
}
.region-label {
  font-size: 15px;
  color: var(--text);
  line-height: 1.6;
}
.region-heading {
  display: grid;
  align-content: start;
  gap: 4px;
}
.rk-victor {
  font-size: 13px;
  color: var(--muted);
}
.region-result {
  min-width: 0;
}
.victor-names {
  display: flex;
  gap: 4px 12px;
  flex-wrap: wrap;
  a {
    color: var(--accent);
    font-size: 17px;
    font-weight: 600;
    overflow-wrap: anywhere;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
}
.date-line {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 10px;
  margin-top: 5px;
  font-size: 13px;
  color: var(--muted);
}
.unknown {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.55;
}
@media (max-width: 520px) {
  .region-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .region-label {
    font-size: 14px;
  }
}
</style>
