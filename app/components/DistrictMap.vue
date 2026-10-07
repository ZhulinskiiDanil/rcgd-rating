<script setup lang="ts">
import type { RankedDistrict } from "#shared/types/domain";

type Bounds = [number, number, number, number];
interface MapFeature {
  osmId: number;
  name: string;
  sourceName: string;
  region: "spb" | "lo";
  bounds: Bounds;
  path: string;
}
interface MapData {
  viewBox: Bounds;
  cityBounds: Bounds;
  timestamp: string;
  features: MapFeature[];
}
const props = defineProps<{ districts: RankedDistrict[] }>();
const emit = defineEmits<{ select: [districtId: number] }>();
const { data, error, refresh } = await useFetch<MapData>(
  "/geo/districts.json",
  {
    key: "district-geometry",
  },
);
const svg = ref<SVGSVGElement | null>(null);
const selectId = useId();
const selectedId = ref<number | null>(null);
const hoveredId = ref<number | null>(null);
const view = ref<Bounds>(data.value?.viewBox ?? [0, 0, 1000, 645]);
const dragging = ref(false);
let pointer: {
  id: number;
  x: number;
  y: number;
  initial: Bounds;
  factor: number;
  moved: boolean;
  feature: number | null;
} | null = null;

function normalizedName(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/ (район|муниципальный округ|городской округ)$/, "")
    .trim();
}
const mapped = computed(() =>
  (data.value?.features ?? []).map((feature) => ({
    ...feature,
    district: props.districts.find(
      (district) =>
        district.region === feature.region &&
        normalizedName(district.name) === normalizedName(feature.name),
    ),
  })),
);
const selected = computed(() =>
  mapped.value.find((feature) => feature.osmId === selectedId.value),
);
const hovered = computed(() =>
  mapped.value.find((feature) => feature.osmId === hoveredId.value),
);
const district = computed(() => selected.value?.district);
const legacyCount = computed(() => district.value?.legacyCompletionCount ?? 0);
const hasProfile = computed(
  () =>
    !!district.value && district.value.completionCount + legacyCount.value > 0,
);
const completedDistricts = computed(
  () => props.districts.filter((item) => item.completionCount > 0).length,
);
const zoom = computed(() => (data.value?.viewBox[2] ?? 1000) / view.value[2]);
const regionName = (region: "spb" | "lo") =>
  region === "spb" ? "Санкт-Петербург" : "Ленинградская область";
const score = (value: number) =>
  value.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function setView(next: Bounds) {
  const full = data.value?.viewBox;
  if (!full) return;
  const width = Math.min(full[2], Math.max(full[2] / 24, next[2]));
  const height = (width * full[3]) / full[2];
  view.value = [
    Math.max(full[0], Math.min(full[0] + full[2] - width, next[0])),
    Math.max(full[1], Math.min(full[1] + full[3] - height, next[1])),
    width,
    height,
  ];
}
function zoomAt(factor: number) {
  const [x, y, width, height] = view.value;
  const nextWidth = Math.min(
    data.value?.viewBox[2] ?? 1000,
    Math.max((data.value?.viewBox[2] ?? 1000) / 24, width / factor),
  );
  const ratio = nextWidth / width;
  setView([
    x + (width * (1 - ratio)) / 2,
    y + (height * (1 - ratio)) / 2,
    nextWidth,
    height * ratio,
  ]);
}
function fit(bounds?: Bounds) {
  if (!bounds || !data.value) return;
  const [x, y, width, height] = bounds;
  const targetWidth =
    Math.max(width, (height * data.value.viewBox[2]) / data.value.viewBox[3]) *
    1.18;
  const targetHeight =
    (targetWidth * data.value.viewBox[3]) / data.value.viewBox[2];
  setView([
    x + width / 2 - targetWidth / 2,
    y + height / 2 - targetHeight / 2,
    targetWidth,
    targetHeight,
  ]);
}
function reset() {
  if (data.value) view.value = [...data.value.viewBox];
}
function choose(id: number | null, focus = false) {
  selectedId.value = id;
  const feature = mapped.value.find((item) => item.osmId === id);
  if (feature?.district) emit("select", feature.district.id);
  if (focus && feature) fit(feature.bounds);
}
function selectFromList(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  choose(value ? Number(value) : null, true);
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || pointer || !svg.value) return;
  const rectangle = svg.value.getBoundingClientRect();
  const target =
    event.target instanceof Element
      ? event.target.closest("[data-district]")
      : null;
  pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    initial: [...view.value],
    factor: Math.max(
      view.value[2] / rectangle.width,
      view.value[3] / rectangle.height,
    ),
    moved: false,
    feature: target ? Number(target.getAttribute("data-district")) : null,
  };
  svg.value.setPointerCapture(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x,
    dy = event.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 4) {
    pointer.moved = true;
    dragging.value = true;
  }
  if (pointer.moved)
    setView([
      pointer.initial[0] - dx * pointer.factor,
      pointer.initial[1] - dy * pointer.factor,
      pointer.initial[2],
      pointer.initial[3],
    ]);
}
function pointerUp(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return;
  const previous = pointer;
  pointer = null;
  dragging.value = false;
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId);
  if (!previous.moved && previous.feature !== null) choose(previous.feature);
}
function pointerCancel() {
  pointer = null;
  dragging.value = false;
}
function wheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15);
}
function keyboard(event: KeyboardEvent) {
  const [x, y, width, height] = view.value;
  const movements: Record<string, Bounds> = {
    ArrowLeft: [x - width / 8, y, width, height],
    ArrowRight: [x + width / 8, y, width, height],
    ArrowUp: [x, y - height / 8, width, height],
    ArrowDown: [x, y + height / 8, width, height],
  };
  const movement = movements[event.key];
  if (movement) {
    event.preventDefault();
    setView(movement);
  } else if (["+", "="].includes(event.key)) {
    event.preventDefault();
    zoomAt(1.4);
  } else if (["-", "−"].includes(event.key)) {
    event.preventDefault();
    zoomAt(1 / 1.4);
  } else if (event.key === "Home") {
    event.preventDefault();
    reset();
  }
}
</script>

<template>
  <section
    class="district-map"
    aria-label="Карта районов Санкт-Петербурга и Ленинградской области"
  >
    <div class="map-heading">
      <div>
        <h2>На карте</h2>
        <p>Один город и область. Найди свой район.</p>
      </div>
      <span class="map-total"
        >{{ completedDistricts }} районов в текущем рейтинге</span
      >
    </div>
    <div v-if="error" class="map-error" role="alert">
      <p>Не удалось загрузить границы районов.</p>
      <button type="button" @click="refresh()">Попробовать снова</button>
    </div>
    <div v-else-if="data" class="map-layout">
      <div class="map-canvas">
        <div class="map-controls">
          <div>
            <button type="button" @click="reset">Весь регион</button
            ><button type="button" @click="fit(data.cityBounds)">
              Петербург крупнее
            </button>
          </div>
          <div class="zoom-controls">
            <button
              type="button"
              aria-label="Уменьшить масштаб карты"
              :disabled="zoom <= 1"
              @click="zoomAt(1 / 1.4)"
            >
              −</button
            ><span>{{ zoom.toFixed(1) }}×</span
            ><button
              type="button"
              aria-label="Увеличить масштаб карты"
              :disabled="zoom >= 24"
              @click="zoomAt(1.4)"
            >
              +
            </button>
          </div>
        </div>
        <svg
          ref="svg"
          :viewBox="view.join(' ')"
          :class="{ dragging }"
          role="group"
          aria-label="Интерактивная карта. Стрелки перемещают карту, плюс и минус меняют масштаб, Home показывает весь регион."
          tabindex="0"
          @pointerdown="pointerDown"
          @pointermove="pointerMove"
          @pointerup="pointerUp"
          @pointercancel="pointerCancel"
          @lostpointercapture="pointerCancel"
          @wheel="wheel"
          @keydown="keyboard"
          @pointerleave="hoveredId = null"
        >
          <path
            v-for="feature in mapped"
            :key="feature.osmId"
            :d="feature.path"
            :data-district="feature.osmId"
            :class="[
              'district-shape',
              feature.region,
              {
                populated: (feature.district?.completionCount ?? 0) > 0,
                selected: selectedId === feature.osmId,
              },
            ]"
            fill-rule="evenodd"
            vector-effect="non-scaling-stroke"
            role="button"
            tabindex="0"
            :aria-pressed="selectedId === feature.osmId"
            :aria-label="`${feature.name}, ${regionName(feature.region)}. ${feature.district?.completionCount || 0} пройденных уровней в топ-150.`"
            @pointerenter="hoveredId = feature.osmId"
            @focus="hoveredId = feature.osmId"
            @blur="hoveredId = null"
            @keydown.enter.prevent.stop="choose(feature.osmId)"
            @keydown.space.prevent.stop="choose(feature.osmId)"
          >
            <title>{{ feature.name }} · {{ regionName(feature.region) }}</title>
          </path>
        </svg>
        <div class="map-caption" aria-hidden="true">
          <strong v-if="hovered">{{ hovered.name }}</strong
          ><span v-else>Выбери район на карте</span
          ><span>Перетаскивай карту · Ctrl + прокрутка — масштаб</span>
        </div>
        <div class="map-legend">
          <span><i class="populated"></i>Есть прохождения в топ-150</span
          ><span><i></i>Нет прохождений в топ-150</span>
        </div>
      </div>
      <aside class="map-sidebar">
        <label :for="selectId">Выбрать район</label>
        <select
          :id="selectId"
          :value="selectedId ?? ''"
          @change="selectFromList"
        >
          <option value="">Все районы</option>
          <optgroup
            v-for="region in ['spb', 'lo'] as const"
            :key="region"
            :label="regionName(region)"
          >
            <option
              v-for="feature in mapped.filter((item) => item.region === region)"
              :key="feature.osmId"
              :value="feature.osmId"
            >
              {{ feature.name }}
            </option>
          </optgroup>
        </select>
        <div v-if="selected" class="district-info" aria-live="polite">
          <p class="region-label">{{ regionName(selected.region) }}</p>
          <h3>{{ selected.name }}</h3>
          <template v-if="district">
            <div v-if="district.completionCount > 0" class="district-score">
              <strong>{{ score(district.score) }}</strong
              ><span v-if="district.rank"
                >#{{ district.rank }} в рейтинге районов</span
              >
            </div>
            <p v-else class="empty-district">
              {{
                legacyCount
                  ? "Нет прохождений в текущем топ-150"
                  : "Нет прохождений"
              }}
            </p>
            <dl>
              <div>
                <dt>Игроков</dt>
                <dd>{{ district.playerCount }}</dd>
              </div>
              <div>
                <dt>Пройденных уровней</dt>
                <dd>{{ district.completionCount }}</dd>
              </div>
              <div v-if="legacyCount">
                <dt>Legacy list</dt>
                <dd>{{ legacyCount }}</dd>
              </div>
            </dl>
            <NuxtLink
              v-if="hasProfile"
              :to="`/districts/${district.id}`"
              class="district-link"
              >Открыть район<AppIcon name="arrow" :size="18"
            /></NuxtLink>
          </template>
          <p v-else class="empty-district">
            Для этой территории пока нет данных рейтинга.
          </p>
          <button
            type="button"
            class="focus-district"
            @click="fit(selected.bounds)"
          >
            Приблизить район
          </button>
        </div>
        <div v-else class="map-invitation">
          <AppIcon name="map" :size="34" />
          <h3>У каждого рекорда есть свой район</h3>
          <p>
            Нажми на территорию, чтобы увидеть её игроков и пройденные уровни.
            Небольшие районы Петербурга удобнее смотреть вблизи.
          </p>
        </div>
      </aside>
    </div>
    <p class="map-attribution">
      Упрощённые административные границы:
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        >© OpenStreetMap contributors</a
      >,
      <a
        href="https://opendatacommons.org/licenses/odbl/1-0/"
        target="_blank"
        rel="noopener noreferrer"
        >ODbL</a
      >. <a href="/geo/districts.json" download>Данные карты</a>
    </p>
  </section>
</template>

<style scoped lang="scss">
.district-map {
  margin: 42px 0;
  --empty-district: color-mix(in srgb, var(--surface-raised) 82%, var(--muted));
}
.map-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 20px;
  margin-bottom: 24px;
  h2 {
    font-size: clamp(25px, 3vw, 36px);
    margin: 0 0 10px;
  }
  p {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
  }
}
.map-total {
  color: var(--muted);
  font-size: 14px;
  padding-bottom: 4px;
}
.map-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  background: var(--surface);
}
.map-canvas {
  min-width: 0;
  background: color-mix(in srgb, var(--accent-soft) 48%, var(--surface));
}
.map-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 18px;
  > div {
    display: flex;
    gap: 7px;
    align-items: center;
  }
  button {
    min-height: 40px;
    padding: 9px 12px;
    font-size: 13px;
    background: var(--surface);
  }
  .zoom-controls {
    flex-shrink: 0;
    button {
      font-size: 23px;
      line-height: 1;
      width: 40px;
      padding: 6px;
    }
    span {
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      min-width: 37px;
      text-align: center;
      color: var(--muted);
    }
  }
}
.map-canvas > svg {
  display: block;
  width: 100%;
  height: clamp(310px, 40vw, 580px);
  touch-action: none;
  cursor: grab;
  outline-offset: -4px;
  &.dragging {
    cursor: grabbing;
  }
}
.district-shape {
  fill: var(--empty-district);
  stroke: var(--surface);
  stroke-width: 1.5px;
  cursor: pointer;
  outline: none;
  transition: fill 0.12s;
  &.spb {
    stroke: var(--line);
    stroke-width: 1px;
  }
  &.populated {
    fill: color-mix(in srgb, var(--accent) 45%, var(--surface));
  }
  &:hover {
    fill: color-mix(in srgb, var(--accent) 70%, var(--surface));
  }
  &:focus-visible {
    fill: color-mix(in srgb, var(--accent) 70%, var(--surface));
    outline: none;
    stroke: var(--warm);
    stroke-width: 2.5px;
  }
  &.selected {
    fill: var(--accent);
  }
}
.map-caption {
  min-height: 43px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 21px;
  font-size: 13px;
  color: var(--muted);
  strong {
    font-weight: 500;
    color: var(--text);
  }
  > span:last-child {
    font-size: 12px;
  }
}
.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  padding: 15px 21px 20px;
  color: var(--muted);
  font-size: 12px;
  > span {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  i {
    width: 13px;
    height: 13px;
    display: inline-block;
    background: var(--empty-district);
    border: 1px solid var(--line);
    border-radius: 3px;
    &.populated {
      background: color-mix(in srgb, var(--accent) 45%, var(--surface));
    }
  }
}
.map-sidebar {
  padding: 26px;
  border-left: 1px solid var(--line);
  min-width: 0;
  > label {
    display: block;
    margin-bottom: 10px;
    font-size: 14px;
  }
  > select {
    width: 100%;
    min-width: 0;
    font-size: 14px;
  }
}
.district-info {
  padding-top: 25px;
  h3 {
    font-size: 23px;
    line-height: 1.4;
    overflow-wrap: anywhere;
    margin: 8px 0 22px;
  }
  .region-label {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.6;
    margin: 0;
  }
  dl {
    margin: 24px 0;
    display: grid;
    gap: 14px;
    > div {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 15px;
    }
    dt {
      font-size: 14px;
      color: var(--muted);
    }
    dd {
      margin: 0;
      font-size: 17px;
      font-variant-numeric: tabular-nums;
    }
  }
}
.district-score {
  display: flex;
  flex-direction: column;
  gap: 8px;
  strong {
    font-size: 38px;
    font-weight: 500;
    letter-spacing: -0.04em;
  }
  span {
    color: var(--muted);
    font-size: 14px;
  }
}
.empty-district {
  color: var(--muted);
  font-size: 16px;
  line-height: 1.6;
}
.district-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: var(--accent);
  color: var(--on-accent);
  text-decoration: none;
  padding: 13px 16px;
  border-radius: 9px;
  font-size: 14px;
}
.focus-district {
  margin-top: 13px;
  background: transparent;
  width: 100%;
  font-size: 14px;
}
.map-invitation {
  padding-top: 43px;
  > svg {
    color: var(--accent);
  }
  h3 {
    font-size: 21px;
    line-height: 1.45;
    margin: 20px 0 14px;
  }
  p {
    font-size: 14px;
    line-height: 1.8;
    color: var(--muted);
    margin: 0;
  }
}
.map-attribution {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
  margin: 12px 0 0;
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}
.map-error {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 12px;
  p {
    color: var(--danger);
    margin-top: 0;
  }
}
@media (max-width: 1000px) {
  .map-layout {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
  .map-sidebar {
    padding: 20px;
  }
  .map-controls {
    padding: 12px;
    flex-wrap: wrap;
  }
  .map-caption {
    flex-wrap: wrap;
    padding-inline: 14px;
  }
  .map-caption > span:last-child {
    display: none;
  }
  .district-info h3 {
    font-size: 20px;
  }
}
@media (max-width: 760px) {
  .map-heading {
    align-items: start;
    flex-direction: column;
    gap: 12px;
  }
  .map-layout {
    grid-template-columns: 1fr;
  }
  .map-sidebar {
    border-left: 0;
    border-top: 1px solid var(--line);
    padding: 23px;
  }
  .map-canvas > svg {
    height: 350px;
  }
  .map-invitation {
    padding-top: 24px;
    > svg {
      display: none;
    }
    h3 {
      margin-top: 0;
    }
  }
  .map-controls button {
    font-size: 12px;
    padding: 8px 10px;
  }
  .district-info {
    padding-top: 20px;
  }
  .map-legend {
    padding-inline: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .district-shape {
    transition: none;
  }
}
</style>
