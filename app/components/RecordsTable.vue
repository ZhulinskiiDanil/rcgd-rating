<script setup lang="ts">
import type {
  District,
  Level,
  Player,
  RecordEntry,
} from "#shared/types/domain";
import { effectivePercent, hasLevelPage } from "#shared/utils/rating";
import { formatPosition } from "#shared/utils/presentation";
import { recordVideoUrl } from "#shared/utils/record-video";
import { formatCompletionDate } from "#shared/utils/victors";
type PublicRecord = Omit<RecordEntry, "note"> & { fromSheet?: boolean };
const props = defineProps<{
  records: PublicRecord[];
  players: (Player & { avatar?: string | null })[];
  levels: Level[];
  districts?: District[];
  highlightCompletions?: boolean;
  firstRecordIds?: number[];
}>();
const percent = (r: PublicRecord) => effectivePercent({ ...r, note: "" });
const playerMap = computed(() => new Map(props.players.map((p) => [p.id, p])));
const levelMap = computed(() => new Map(props.levels.map((l) => [l.id, l])));
const video = recordVideoUrl;
const linkedLevels = computed(
  () => new Set(props.levels.filter(hasLevelPage).map((level) => level.id)),
);
const firstIds = computed(() => new Set(props.firstRecordIds ?? []));
const districtRegions = computed(
  () =>
    new Map(
      props.districts?.map((district) => [district.id, district.region]) ?? [],
    ),
);
function regionalMark(record: PublicRecord) {
  if (percent(record) !== 100) return "";
  const districtId = playerMap.value.get(record.playerId)?.districtId;
  const region = districtId ? districtRegions.value.get(districtId) : null;
  return region === "spb" && record.isFirstSpb
    ? "Первый СПб виктор"
    : region === "lo" && record.isFirstLo
      ? "Первый ЛО виктор"
      : "";
}
</script>
<template>
  <div v-if="records.length" class="table-wrap records-wrap">
    <table class="records-table">
      <thead>
        <tr>
          <th>Игрок / уровень</th>
          <th>Результат</th>
          <th>Дата</th>
          <th><span class="video-heading">Видео</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in records"
          :key="r.id"
          :class="{
            'completed-record': highlightCompletions && percent(r) === 100,
            'first-record': highlightCompletions && firstIds.has(r.id),
          }"
        >
          <td>
            <div class="record-person">
              <UserAvatar
                :name="playerMap.get(r.playerId)?.name || 'Игрок'"
                :url="playerMap.get(r.playerId)?.avatar"
              />
              <div>
                <NuxtLink :to="`/players/${r.playerId}`" class="player-name">{{
                  playerMap.get(r.playerId)?.name || "Игрок"
                }}</NuxtLink>
                <NuxtLink
                  v-if="linkedLevels.has(r.levelId)"
                  :to="`/levels/${r.levelId}`"
                  class="level-name"
                  >{{ levelMap.get(r.levelId)?.name || "Уровень" }}</NuxtLink
                >
                <span v-else class="level-name">{{
                  levelMap.get(r.levelId)?.name || "Уровень"
                }}</span>
                <small v-if="r.isFirstRk" class="rk-victor"
                  >Первый РК виктор</small
                >
                <small v-if="regionalMark(r)" class="rk-victor">{{
                  regionalMark(r)
                }}</small>
              </div>
            </div>
          </td>
          <td>
            <div class="result" :class="{ complete: percent(r) === 100 }">
              <span
                ><AppIcon v-if="percent(r) === 100" name="check" />{{
                  formatPosition(percent(r))
                }}%</span
              >
              <div class="progress-track" aria-hidden="true">
                <span :style="{ width: percent(r) + '%' }" />
              </div>
              <small
                v-if="highlightCompletions && firstIds.has(r.id)"
                class="first-note"
                >Первое прохождение в регионе</small
              >
            </div>
          </td>
          <td class="record-date">
            <time v-if="r.achievedAt" :datetime="r.achievedAt">{{
              formatCompletionDate(r.achievedAt)
            }}</time
            ><span v-else>Не указана</span>
          </td>
          <td class="video-cell">
            <div class="record-actions">
              <a
                v-if="video(r)"
                :href="video(r)"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Смотреть рекорд ${playerMap.get(r.playerId)?.name || ''} на ${levelMap.get(r.levelId)?.name || 'уровне'}`"
                title="Смотреть видео"
                ><AppIcon name="play" /></a
              ><span v-else class="no-video">—</span>
              <EntityEditButton
                resource="records"
                :entity-id="r.id"
                :label="`Редактировать рекорд ${playerMap.get(r.playerId)?.name || ''}`"
                compact
              />
              <EntityDeleteButton resource="records" :entity-id="r.id" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="empty-records">
    <AppIcon name="trophy" />
    <h3>Рекордов пока нет</h3>
    <p>
      Прохождения и прогрессы появятся здесь после добавления или импорта из
      глобала.
    </p>
  </div>
</template>
<style scoped lang="scss">
.rk-victor {
  color: var(--muted);
  font-size: 12px;
}
.records-wrap {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
.records-table {
  width: 100%;
  th {
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    padding: 17px 20px;
    white-space: nowrap;
  }
  td {
    padding: 20px;
    vertical-align: middle;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
}
.record-person {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
  > img {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 9px;
  }
  > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}
.player-name {
  color: var(--text);
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  &:hover {
    color: var(--accent);
  }
}
.level-name {
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
  &:hover {
    color: var(--accent);
  }
}
.result {
  min-width: 66px;
  max-width: 100px;
  color: var(--warm);
  > span {
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    svg {
      width: 13px;
      height: 13px;
    }
  }
  &.complete {
    color: var(--accent);
  }
}
.progress-track {
  width: 100%;
  height: 3px;
  background: var(--line);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 8px;
  span {
    height: 100%;
    display: block;
    background: currentColor;
  }
}
.records-table tbody tr.completed-record td {
  border-block: 1px solid var(--success);
  &:first-child {
    border-left: 1px solid var(--success);
  }
  &:last-child {
    border-right: 1px solid var(--success);
  }
}
.records-table tbody tr.first-record td {
  border-color: var(--warm);
  background: color-mix(in srgb, var(--warm), transparent 94%);
}
.first-note {
  display: block;
  color: var(--warm);
  font-size: 12px;
  margin-top: 8px;
  line-height: 1.4;
}
.record-date {
  white-space: nowrap;
  font-size: 13px;
  color: var(--muted);
  small {
    display: block;
    margin-top: 5px;
    white-space: normal;
    max-width: 150px;
    font-size: 12px;
  }
}
.record-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.video-cell {
  text-align: right;
  a {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-radius: 7px;
    color: var(--text);
    &:hover {
      color: var(--accent);
      border-color: var(--accent);
    }
    svg {
      width: 13px;
      height: 13px;
    }
  }
}
.video-heading {
  float: right;
}
.no-video {
  color: var(--muted);
  padding-right: 10px;
}
.empty-records {
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  padding: 36px 24px;
  text-align: center;
  > svg {
    width: 27px;
    height: 27px;
    color: var(--muted);
  }
  h3 {
    font-size: 18px;
    font-weight: 500;
    margin: 15px 0 10px;
  }
  p {
    color: var(--muted);
    font-size: 15px;
    line-height: 1.7;
    max-width: 420px;
    margin: 0 auto;
  }
}
@media (max-width: 650px) {
  .records-table td,
  .records-table th {
    padding: 13px 10px;
  }
  .record-person {
    gap: 8px;
    min-width: 125px;
    > img {
      width: 25px;
      height: 25px;
    }
  }
}
</style>
