<script setup lang="ts">
import type { RankedDistrict } from "#shared/types/domain";
const props = defineProps<{
  district: Pick<
    RankedDistrict,
    "mainCompletionCount" | "extendedCompletionCount" | "legacyCompletionCount"
  >;
}>();
const counts = computed(() =>
  [
    { label: "Main list", count: props.district.mainCompletionCount },
    { label: "Extended list", count: props.district.extendedCompletionCount },
    { label: "Legacy list", count: props.district.legacyCompletionCount },
  ].filter((item) => item.count > 0),
);
</script>
<template>
  <small v-if="counts.length" class="completion-lists">
    <span class="completion-list-items">
      <span v-for="item in counts" :key="item.label"
        >{{ item.label }}: {{ item.count }}</span
      >
    </span>
  </small>
</template>
<style scoped lang="scss">
.completion-lists {
  display: block;
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: normal;
  white-space: nowrap;
}
.completion-list-items {
  display: grid;
  gap: 6px;
}
</style>
