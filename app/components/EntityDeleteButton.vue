<script setup lang="ts">
const props = defineProps<{
  resource: "levels" | "records" | "extras" | "players";
  entityId: number;
  label?: string;
  compact?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ saved: [] }>();
const { canEdit, notice } = useEntityEditor();
const route = useRoute();
const busy = ref(false),
  error = ref("");
async function remove() {
  const message =
    props.resource === "levels"
      ? "Убрать уровень из СПб-листа без переноса в Legacy? Синхронизация не вернёт его автоматически."
      : props.resource === "players"
        ? "Удалить игрока из публичного рейтинга? Его данные сохранятся и будут доступны для восстановления."
        : "Удалить это достижение? Рейтинг будет пересчитан.";
  if (busy.value || !window.confirm(message)) return;
  busy.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/${props.resource}/${props.entityId}`, {
      method: "DELETE",
    });
    notice.value =
      props.resource === "levels"
        ? "Уровень убран из листа."
        : "Достижение удалено.";
    if (
      props.resource === "levels" &&
      route.path === `/levels/${props.entityId}`
    )
      await navigateTo("/demonlist");
    await refreshNuxtData();
    emit("saved");
  } catch (cause: any) {
    error.value =
      cause.data?.message || "Не удалось удалить. Попробуй ещё раз.";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <span v-if="canEdit(resource)" class="delete-action"
    ><button
      type="button"
      :disabled="disabled || busy"
      :title="label || 'Удалить'"
      :aria-label="label || 'Удалить'"
      @click.stop="remove"
    >
      <AppIcon name="trash" :size="16" /><span v-if="!compact">{{
        busy ? "Удаляем…" : label || "Удалить"
      }}</span></button
    ><span v-if="error" class="error" role="alert">{{ error }}</span></span
  >
</template>
<style scoped lang="scss">
.delete-action {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  gap: 8px;
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow-wrap: normal;
    color: var(--danger);
    padding: 8px 10px;
    font-size: 13px;
  }
  .error {
    font-size: 12px;
  }
}
</style>
