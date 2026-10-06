<script setup lang="ts">
import type { RegionalFirstVictor } from "#shared/utils/victors";
import { formatCompletionDate } from "#shared/utils/victors";
defineProps<{ rows: RegionalFirstVictor[] }>();
</script>

<template>
  <section class="regional-victors" aria-labelledby="first-victors-heading">
    <h2 id="first-victors-heading">Первые викторы</h2>
    <div v-for="row in rows" :key="row.region" class="region-row">
      <span class="region-label">{{ row.label }}</span>
      <div class="region-result">
        <template v-if="row.firstDate">
          <div class="victor-names" v-if="row.victors.length">
            <NuxtLink
              v-for="victor in row.victors"
              :key="victor.playerId"
              :to="`/players/${victor.playerId}`"
              >{{ victor.name }}</NuxtLink
            >
          </div>
          <span v-else class="unknown">Виктор не указан</span>
          <div class="date-line">
            <time :datetime="row.firstDate">{{
              formatCompletionDate(row.firstDate)
            }}</time>
            <span v-if="row.hasUndated">по известным датам</span>
            <span v-if="row.victors.length > 1">одна дата прохождения</span>
          </div>
        </template>
        <span v-else-if="row.hasCompletions" class="unknown"
          >Дата первого прохождения не указана</span
        >
        <span v-else class="unknown">Нет прохождений с указанным регионом</span>
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
