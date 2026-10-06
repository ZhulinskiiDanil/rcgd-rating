<script setup lang="ts">
defineProps<{
  sync: {
    status: string;
    finishedAt: string | null;
    error: string | null;
  } | null;
}>();
const date = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
</script>
<template>
  <div
    class="status"
    :class="{
      'has-warning': sync?.status === 'failed' || sync?.status === 'partial',
    }"
  >
    <span class="status-dot"></span>
    <div>
      <strong>{{
        sync?.status === "running"
          ? "Обновляем данные"
          : sync?.status === "failed"
            ? "Показаны сохранённые данные"
            : sync?.status === "partial"
              ? "Данные обновлены частично"
              : sync?.finishedAt
                ? "Список обновлён"
                : "Ожидаем первое обновление"
      }}</strong
      ><span v-if="sync?.finishedAt">{{ date(sync.finishedAt) }} МСК</span
      ><span v-if="sync?.status === 'partial'"
        >Есть несопоставленные данные источников</span
      ><span v-if="sync?.status === 'failed'"
        >Источник временно недоступен</span
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.status {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 14px;
  color: var(--muted);
}
.status strong {
  display: block;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
}
.status span:not(.status-dot) {
  display: block;
  font-size: 14px;
  margin-top: 4px;
}
.status-dot {
  height: 8px;
  width: 8px;
  border-radius: 50%;
  background: var(--success);
  margin-top: 7px;
  flex-shrink: 0;
}
.has-warning .status-dot {
  background: var(--warm);
}
</style>
