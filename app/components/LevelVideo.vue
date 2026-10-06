<script setup lang="ts">
import type { Level } from "#shared/types/domain";
import { videoEmbed } from "#shared/utils/video-embed";
const props = defineProps<{ level: Level; fallbackVideo?: string }>();
const playing = ref(false);
const video = computed(
  () => props.level.showcaseVideo || props.fallbackVideo || props.level.video,
);
const embed = computed(() => videoEmbed(video.value));
watch(video, () => (playing.value = false));
</script>
<template>
  <div class="video-frame">
    <iframe
      v-if="playing && embed?.kind === 'iframe'"
      :src="embed.url"
      :title="`Видео уровня ${level.name}`"
      allow="
        accelerometer;
        autoplay;
        clipboard-write;
        encrypted-media;
        gyroscope;
        picture-in-picture;
        fullscreen;
      "
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    />
    <video
      v-else-if="playing && embed?.kind === 'video'"
      :src="embed.url"
      controls
      preload="metadata"
    />
    <template v-else
      ><LevelArtwork :level="level" eager /><button
        v-if="embed"
        class="play"
        @click="playing = true"
      >
        <AppIcon name="play" :size="32" /><span>Смотреть видео</span></button
      ><a
        v-else-if="level.showcaseVideo"
        :href="level.showcaseVideo"
        class="play"
        target="_blank"
        rel="noopener noreferrer"
        ><AppIcon name="play" :size="32" /><span
          >Смотреть видео<AppIcon name="external" /></span></a
    ></template>
  </div>
</template>
<style scoped lang="scss">
.video-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  background: var(--art-bg);
  overflow: hidden;
  iframe,
  video {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: contain;
  }
}
.play {
  position: absolute;
  inset: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 14px;
  border: 0;
  border-radius: 0;
  background: #00153255;
  color: white;
  font-size: 14px;
  &:hover {
    background: #00153277;
    color: white;
  }
  span {
    display: flex;
    gap: 8px;
    align-items: center;
  }
}
</style>
