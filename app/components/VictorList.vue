<script setup lang="ts">
import type { Victor } from "#shared/utils/victors";
import { formatCompletionDate } from "#shared/utils/victors";
defineProps<{ victors: Victor[] }>();
</script>

<template>
  <ul
    v-if="victors.length"
    class="victor-list"
    aria-label="Викторы по дате прохождения"
  >
    <li v-for="victor in victors" :key="victor.playerId">
      <NuxtLink :to="`/players/${victor.playerId}`">{{ victor.name }}</NuxtLink>
      <time v-if="victor.achievedAt" :datetime="victor.achievedAt">{{
        formatCompletionDate(victor.achievedAt)
      }}</time>
      <span v-else>Дата не указана</span>
    </li>
  </ul>
  <span v-else class="unknown-victor">Виктор не указан</span>
</template>

<style scoped lang="scss">
.victor-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 14px;
  }
  a {
    color: var(--accent);
    font-size: 14px;
    text-decoration: none;
    overflow-wrap: anywhere;
    &:hover {
      text-decoration: underline;
    }
  }
  time,
  span {
    color: var(--muted);
    font-size: 13px;
  }
}
.unknown-victor {
  display: block;
  margin-top: 8px;
  color: var(--muted);
  font-size: 14px;
}
</style>
