import { computed, effectScope, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import {
  useDistrictMapViewport,
  type MapBounds,
} from "../app/composables/useDistrictMapViewport";

describe("district map viewport", () => {
  it("refits a district when geometry resolves after client navigation and when a fresh snapshot replaces it", async () => {
    const scope = effectScope();
    const geometry = ref<{ viewBox: MapBounds; bounds: MapBounds }>();
    const viewport = scope.run(() =>
      useDistrictMapViewport(
        computed(() => geometry.value?.viewBox),
        computed(() => geometry.value?.bounds),
      ),
    )!;
    expect(viewport.view.value).toEqual([0, 0, 1000, 645]);
    geometry.value = { viewBox: [0, 0, 1000, 700], bounds: [400, 350, 10, 8] };
    await nextTick();
    expect(viewport.view.value[2]).toBeLessThan(20);
    expect(viewport.view.value[3] / viewport.view.value[2]).toBeCloseTo(0.7);
    expect(viewport.view.value[0] + viewport.view.value[2] / 2).toBeCloseTo(
      405,
    );
    expect(viewport.view.value[1] + viewport.view.value[3] / 2).toBeCloseTo(
      354,
    );

    geometry.value = { viewBox: [0, 0, 1000, 650], bounds: [510, 420, 20, 15] };
    await nextTick();
    expect(viewport.view.value[3] / viewport.view.value[2]).toBeCloseTo(0.65);
    expect(viewport.view.value[0] + viewport.view.value[2] / 2).toBeCloseTo(
      520,
    );
    viewport.reset();
    expect(viewport.view.value).toEqual([0, 0, 1000, 650]);
    scope.stop();
  });

  it("uses the loaded overview without focusing a district and keeps panning inside its bounds", async () => {
    const scope = effectScope();
    const full = ref<MapBounds>();
    const viewport = scope.run(() => useDistrictMapViewport(full, ref()))!;
    full.value = [5, 10, 1000, 700];
    await nextTick();
    expect(viewport.view.value).toEqual(full.value);
    viewport.setView([-999, 9999, 100, 100]);
    expect(viewport.view.value).toEqual([5, 640, 100, 70]);
    scope.stop();
  });
});
