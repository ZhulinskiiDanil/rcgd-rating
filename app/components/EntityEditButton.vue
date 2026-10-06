<script setup lang="ts">
import type { EntityResource } from "../types/admin";
const props = defineProps<{
  resource: EntityResource;
  entityId?: number;
  defaults?: Record<string, unknown>;
  label?: string;
  compact?: boolean;
}>();
const editor = useEntityEditor();
const text = computed(
  () => props.label || (props.entityId ? "Редактировать" : "Добавить"),
);
</script>
<template>
  <button
    v-if="editor.canEdit(resource)"
    type="button"
    class="entity-edit-button"
    :class="{ compact }"
    :title="text"
    :aria-label="text"
    @click.stop.prevent="
      editor.open({ resource, entityId, defaults, title: text })
    "
  >
    <AppIcon :name="entityId ? 'edit' : 'plus'" :size="16" />
    <span v-if="!compact">{{ text }}</span>
  </button>
</template>
<style scoped lang="scss">
.entity-edit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--accent);
  font-size: 13px;
  line-height: 1.25;
  white-space: normal;
  cursor: pointer;
  flex-shrink: 0;
  max-width: 100%;
}
.entity-edit-button:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.entity-edit-button.compact {
  width: 36px;
  min-height: 36px;
  padding: 8px;
}
@media (pointer: coarse) {
  .entity-edit-button.compact {
    width: 42px;
    min-height: 42px;
  }
}
</style>
