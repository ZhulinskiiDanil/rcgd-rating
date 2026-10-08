<script setup lang="ts">
const props = defineProps<{ type: "players" | "districts"; id: number }>();
const { data, error, refresh } = await useFetch<
  {
    id: number;
    fromRank: number | null;
    toRank: number | null;
    note: string;
    createdAt: string;
    updatedAt: string | null;
  }[]
>("/api/history", {
  query: { type: props.type, id: props.id },
  key: `history-${props.type}-${props.id}`,
});
function movement(from: number | null, to: number | null) {
  if (from === null || to === null) return "—";
  const delta = from - to;
  return delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${-delta}` : "—";
}
</script>
<template>
  <section class="rating-history">
    <h2>История {{ type === "players" ? "игрока" : "района" }}</h2>
    <p v-if="error" class="error">
      Не удалось загрузить историю.
      <button @click="refresh()">Повторить</button>
    </p>
    <div v-else-if="data?.length" class="table-wrap">
      <table aria-label="История перемещений в рейтинге">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Позиция</th>
            <th>Примечание</th>
            <th>Сдвиг</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in data" :key="event.id">
            <td>
              <time :datetime="event.createdAt">{{
                new Date(event.createdAt).toLocaleDateString("ru-RU", {
                  timeZone: "Europe/Moscow",
                })
              }}</time>
            </td>
            <td>
              {{ event.fromRank ? "#" + event.fromRank : "—" }} →
              {{ event.toRank ? "#" + event.toRank : "—" }}
            </td>
            <td>
              {{ event.note || "—"
              }}<HistoryEventEditor
                type="ratings"
                :event="event"
                @saved="refresh()"
              />
            </td>
            <td>{{ movement(event.fromRank, event.toRank) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">Позиция ещё не менялась.</p>
  </section>
</template>
<style scoped lang="scss">
.rating-history {
  margin-top: 36px;
}
td:not(:nth-child(3)) {
  white-space: nowrap;
}
</style>
