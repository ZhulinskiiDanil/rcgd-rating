<script setup lang="ts">
const props = defineProps<{ levelId: number }>();
const { data, error, refresh } = await useFetch<
  {
    id: number;
    fromRank: number | null;
    toRank: number | null;
    fromTier: string | null;
    toTier: string | null;
    createdAt: string;
  }[]
>("/api/history", { query: { type: "levels", id: props.levelId } });
const tierName = (value: string | null) =>
  ({
    main: "Main list",
    extended: "Extended list",
    legacy: "Legacy list",
    catalog: "Вне листа",
  })[value ?? "catalog"] || value;
function movement(from: number | null, to: number | null) {
  if (from === null || to === null) return "";
  const delta = from - to;
  return delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${-delta}` : "";
}
</script>
<template>
  <section class="level-history">
    <h2>История уровня</h2>
    <p v-if="error" class="error">
      Не удалось загрузить историю.
      <button @click="refresh()">Повторить</button>
    </p>
    <div v-else-if="data?.length" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Позиция</th>
            <th>Раздел</th>
            <th>Сдвиг</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in data" :key="event.id">
            <td>
              {{
                new Date(event.createdAt).toLocaleDateString("ru-RU", {
                  timeZone: "Europe/Moscow",
                })
              }}
            </td>
            <td>
              {{ event.fromRank ? "#" + event.fromRank : "—" }} →
              {{ event.toRank ? "#" + event.toRank : "—" }}
            </td>
            <td>
              {{ tierName(event.fromTier) }} → {{ tierName(event.toTier) }}
            </td>
            <td>{{ movement(event.fromRank, event.toRank) || "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">Позиция ещё не менялась.</p>
  </section>
</template>
<style scoped lang="scss">
.level-history {
  margin-top: 36px;
}
td {
  white-space: nowrap;
}
</style>
