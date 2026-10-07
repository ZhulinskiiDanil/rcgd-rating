import { ref, watch, type Ref } from "vue";

export type MapBounds = [number, number, number, number];
export const DISTRICT_MAP_MAX_ZOOM = 80;

export function useDistrictMapViewport(
  fullBounds: Ref<MapBounds | undefined>,
  focusBounds: Ref<MapBounds | undefined>,
) {
  const view = ref<MapBounds>([0, 0, 1000, 645]);

  function setView(next: MapBounds) {
    const full = fullBounds.value;
    if (!full) return;
    const width = Math.min(
      full[2],
      Math.max(full[2] / DISTRICT_MAP_MAX_ZOOM, next[2]),
    );
    const height = (width * full[3]) / full[2];
    view.value = [
      Math.max(full[0], Math.min(full[0] + full[2] - width, next[0])),
      Math.max(full[1], Math.min(full[1] + full[3] - height, next[1])),
      width,
      height,
    ];
  }

  function fit(bounds?: MapBounds) {
    const full = fullBounds.value;
    if (!bounds || !full) return;
    const [x, y, width, height] = bounds;
    const targetWidth = Math.min(
      full[2],
      Math.max(
        full[2] / DISTRICT_MAP_MAX_ZOOM,
        Math.max(width, (height * full[2]) / full[3]) * 1.18,
      ),
    );
    const targetHeight = (targetWidth * full[3]) / full[2];
    setView([
      x + width / 2 - targetWidth / 2,
      y + height / 2 - targetHeight / 2,
      targetWidth,
      targetHeight,
    ]);
  }

  function reset() {
    if (fullBounds.value) view.value = [...fullBounds.value];
  }

  watch(
    [fullBounds, focusBounds],
    ([full, focus], [previousFull]) => {
      if (full !== previousFull) reset();
      if (focus) fit(focus);
    },
    { immediate: true },
  );

  return { view, setView, fit, reset };
}
