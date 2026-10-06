<script setup lang="ts">
import { formatScore } from "#shared/utils/presentation";
const props = defineProps<{ type: "players" | "districts"; id: number }>();
const { data, error } = await useFetch<
  { id: number; score: number; rank: number | null; createdAt: string }[]
>("/api/history", {
  query: { type: props.type, id: props.id },
  key: `history-${props.type}-${props.id}`,
});
</script>
<template>
  <section class="rating-history">
    <details class="panel">
      <summary>
        <span><AppIcon name="history" /> История рейтинга</span
        ><span class="history-count"
          >{{ data?.length ?? 0 }} <AppIcon name="chevron"
        /></span>
      </summary>
      <p v-if="error" class="error history-message">
        Не удалось загрузить историю рейтинга. Обновите страницу.
      </p>
      <div v-else-if="data?.length" class="table-wrap" tabindex="0">
        <table aria-label="История изменений рейтинга">
          <thead>
            <tr>
              <th scope="col">Дата, МСК</th>
              <th scope="col">Место</th>
              <th scope="col">Балл</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data" :key="r.id">
              <td class="date">
                <time :datetime="r.createdAt">{{
                  new Date(r.createdAt).toLocaleString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })
                }}</time>
              </td>
              <td class="rank">{{ r.rank === null ? "—" : "#" + r.rank }}</td>
              <td class="score">{{ formatScore(r.score) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="history-message">
        Пока без изменений. Здесь появятся изменения позиции в рейтинге.
      </p>
    </details>
  </section>
</template>
<style scoped lang="scss">
.rating-history {
  margin-top: 36px;
}
details {
  overflow: hidden;
}
.table-wrap {
  border: 0;
  border-radius: 0;
}
summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  &::-webkit-details-marker {
    display: none;
  }
  > span {
    display: flex;
    gap: 11px;
    align-items: center;
  }
  :deep(svg) {
    color: var(--muted);
  }
}
.history-count {
  font-size: 14px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  :deep(svg) {
    width: 14px;
    transition: transform 150ms;
  }
}
details[open] {
  summary {
    border-bottom: 1px solid var(--line);
  }
  .history-count :deep(svg) {
    transform: rotate(90deg);
  }
}
table {
  min-width: 360px;
  font-size: 15px;
  th {
    color: var(--muted);
    font-size: 14px;
    font-weight: 500;
  }
  th,
  td {
    padding: 18px 20px;
  }
  th:first-child,
  td:first-child {
    padding-left: 24px;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
}
.date {
  color: var(--muted);
  white-space: nowrap;
}
.rank,
.score {
  font-variant-numeric: tabular-nums;
}
.history-message {
  padding: 22px 24px;
  margin: 0;
  color: var(--muted);
  font-size: 15px;
}
@media (max-width: 520px) {
  summary {
    padding: 20px 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .history-count :deep(svg) {
    transition: none;
  }
}
</style>
