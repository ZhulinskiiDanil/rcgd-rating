<script setup lang="ts">
import { createAvatar } from "@dicebear/core";
import * as initials from "@dicebear/initials";
const props = withDefaults(
  defineProps<{
    name: string;
    url?: string | null;
    size?: "small" | "large";
  }>(),
  { size: "small" },
);
const fallback = computed(() =>
  createAvatar(initials, {
    seed: props.name,
    backgroundColor: ["3155c9", "3d65a8", "516d92", "465caa", "38588a"],
  }).toDataUri(),
);
const failed = ref(false);
watch(
  () => props.url,
  () => {
    failed.value = false;
  },
);
</script>
<template>
  <img
    :src="!failed && url ? url : fallback"
    :alt="`Аватар ${name}`"
    :class="size"
    :width="size === 'large' ? 112 : 36"
    :height="size === 'large' ? 112 : 36"
    referrerpolicy="no-referrer"
    @error="failed = true"
  />
</template>
<style scoped lang="scss">
img {
  border-radius: 10px;
  vertical-align: middle;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  box-sizing: border-box;
}
.small {
  width: 36px;
  height: 36px;
}
.large {
  width: 112px;
  height: 112px;
  border-radius: 24px;
}
@media (max-width: 520px) {
  .large {
    width: 80px;
    height: 80px;
    border-radius: 20px;
  }
}
</style>
