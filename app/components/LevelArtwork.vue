<script setup lang="ts">
import type { Level } from "#shared/types/domain";
const props = defineProps<{ level: Level; eager?: boolean }>();
const failed = ref(false);
const thumbnail = computed(() => {
  if (props.level.previewImage) return props.level.previewImage;
  try {
    const url = new URL(props.level.showcaseVideo || props.level.video),
      host = url.hostname.replace(/^www\./, "");
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1).split("/")[0]
        : ["youtube.com", "m.youtube.com"].includes(host)
          ? url.searchParams.get("v") ||
            url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
          : null;
    return id && /^[\w-]{11}$/.test(id)
      ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      : null;
  } catch {
    return null;
  }
});
watch(
  () => [
    props.level.previewImage,
    props.level.showcaseVideo,
    props.level.video,
  ],
  () => {
    failed.value = false;
  },
);
</script>
<template>
  <div
    class="artwork level-artwork"
    :style="{ '--art-hue': `${(level.id * 41) % 360}deg` }"
  >
    <img
      v-if="thumbnail && !failed"
      :src="thumbnail"
      alt=""
      :loading="eager ? 'eager' : 'lazy'"
      referrerpolicy="no-referrer"
      @error="failed = true"
    /><svg v-else viewBox="0 0 320 180" fill="none" aria-hidden="true">
      <path
        class="grid"
        d="M0 45h320M0 90h320M0 135h320M80 0v180M160 0v180M240 0v180"
      />
      <path
        class="terrain"
        d="M0 157h48l20-36 21 36h29v-23h34v23h29l20-36 21 36h98M0 23h66l18 29 18-29h114l18 29 18-29h68"
      />
      <g transform="translate(137 71) rotate(-14 23 23)">
        <rect width="46" height="46" rx="4" />
        <path d="M10 12h7v8h-7zm19 0h7v8h-7zM11 31h24" />
      </g>
    </svg>
  </div>
</template>
<style scoped lang="scss">
.artwork {
  position: relative;
  overflow: hidden;
  background: var(--art-bg);
  width: 100%;
  height: 100%;
  isolation: isolate;
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
svg {
  width: 100%;
  height: 100%;
  background: hsl(var(--art-hue) 25% 16%);
  stroke: hsl(var(--art-hue) 55% 72%);
  stroke-width: 2;
}
.grid {
  opacity: 0.07;
}
.terrain {
  opacity: 0.5;
}
rect {
  fill: hsl(var(--art-hue) 35% 25%);
}
</style>
