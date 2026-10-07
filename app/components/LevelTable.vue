<script setup lang="ts">
import type { RegionalFirstVictor } from "#shared/utils/victors";
import type { Level } from "#shared/types/domain";
import { hasLevelPage } from "#shared/utils/rating";
import { formatPosition } from "#shared/utils/presentation";
import { formatCompletionDate } from "#shared/utils/victors";
const levelLink = resolveComponent("NuxtLink");
withDefaults(
  defineProps<{
    levels: Level[];
    legacy?: boolean;
    victors?: Record<number, RegionalFirstVictor[]>;
    completed?: Set<number>;
    first?: Set<number>;
    results?: Record<
      number,
      {
        percent: number;
        position: number | null;
        recordId?: number;
        video?: string;
        achievedAt?: string | null;
        isFirstRk?: boolean;
      }
    >;
    firstRegionLabel?: string;
  }>(),
  {
    victors: () => ({}),
    completed: () => new Set<number>(),
    first: () => new Set<number>(),
    results: () => ({}),
  },
);
const exitDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })
    : "Неизвестно";
</script>
<template>
  <div class="level-list">
    <div v-if="levels.length" class="list-heading">
      <span>Место</span><span>Уровень</span
      ><span>{{ legacy ? "Дата выхода" : "Глобал" }}</span>
    </div>
    <div
      v-for="level in levels"
      :key="level.id"
      class="level-entry"
      :class="{
        completed: completed.has(level.id),
        first: first.has(level.id),
        progress: results[level.id] && results[level.id]!.percent < 100,
      }"
    >
      <component
        :is="hasLevelPage(level) ? levelLink : 'div'"
        :to="hasLevelPage(level) ? `/levels/${level.id}` : undefined"
        class="level-row"
        :class="{ 'top-rank': level.localRank === 1 }"
      >
        <span class="rank">{{
          level.status === "legacy"
            ? "—"
            : (results[level.id]?.position ?? level.localRank)
              ? "#" +
                formatPosition(
                  (results[level.id]?.position ?? level.localRank)!,
                )
              : "—"
        }}</span>
        <span class="thumbnail"><LevelArtwork :level="level" /></span>
        <span class="level-info"
          ><strong>{{ level.name }}</strong
          ><span>{{ level.creator || "Автор не указан" }}</span
          ><small
            v-for="row in (victors[level.id] ?? []).filter(
              (r) => r.victors.length,
            )"
            :key="row.region"
            class="victor-line"
            ><span>Первый в {{ row.region === "spb" ? "СПб" : "ЛО" }}</span>
            {{ row.victors.map((v) => v.name).join(", ") }}</small
          ><small v-if="first.has(level.id) && firstRegionLabel">{{
            firstRegionLabel
          }}</small
          ><small v-if="results[level.id]?.isFirstRk">Первый РК виктор</small
          ><time
            v-if="results[level.id]?.achievedAt"
            :datetime="results[level.id]!.achievedAt!"
            >{{ formatCompletionDate(results[level.id]!.achievedAt!) }}</time
          ></span
        >
        <span class="level-numbers"
          ><span v-if="results[level.id]" class="result-percent"
            >{{ formatPosition(results[level.id]!.percent) }}%</span
          ><span class="global-rank"
            ><template v-if="legacy">{{ exitDate(level.exitedAt) }}</template
            ><template v-else-if="level.globalRank"
              >#{{ level.globalRank }} <span class="global-label">Global</span
              ><span class="mobile-global-label">GDL</span></template
            ><template v-else>—</template></span
          ></span
        ><AppIcon class="row-chevron" name="chevron" :size="15" />
      </component>
      <div class="row-actions">
        <template v-if="results[level.id]?.recordId"
          ><a
            v-if="results[level.id]?.video"
            :href="results[level.id]!.video"
            target="_blank"
            rel="noopener noreferrer"
            class="record-video"
            title="Смотреть рекорд"
            ><AppIcon name="play" :size="17" /></a
          ><EntityEditButton
            resource="records"
            :entity-id="results[level.id]!.recordId"
            label="Редактировать рекорд"
            compact /><EntityDeleteButton
            resource="records"
            :entity-id="results[level.id]!.recordId!"
            label="Удалить рекорд"
            compact
        /></template>
        <template v-else>
          <EntityEditButton
            resource="levels"
            :entity-id="level.id"
            :label="`Редактировать уровень ${level.name}`"
            compact
          /><EntityDeleteButton
            resource="levels"
            :entity-id="level.id"
            :label="`Удалить уровень ${level.name}`"
            compact
          />
        </template>
      </div>
    </div>
    <div v-if="!levels.length" class="empty-state">
      <AppIcon name="search" :size="28" />
      <h3>Уровни не найдены</h3>
      <p>Попробуйте другое название или сбросьте поиск.</p>
    </div>
  </div>
</template>
<style scoped lang="scss">
.level-list {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
}
.level-entry {
  display: flex;
  align-items: center;
  border-top: 1px solid var(--line);
}
.row-actions {
  padding-right: 16px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  &:empty {
    display: none;
  }
}
.level-entry.completed {
  box-shadow: inset 4px 0 var(--success);
}
.level-entry.first {
  box-shadow: inset 4px 0 var(--warm);
}
.level-entry.progress {
  box-shadow: inset 4px 0 var(--accent);
}
.level-numbers {
  display: flex;
  gap: 12px;
  align-items: center;
  white-space: nowrap;
  font-size: 13px;
}
.result-percent {
  color: var(--success);
  font-size: 1.25em;
  font-weight: 600;
}
.progress .result-percent {
  color: var(--accent);
}
.level-info time {
  color: var(--muted);
  font-size: 12px;
}
.record-video {
  display: inline-flex;
  padding: 8px;
}
.victor-line > span {
  font-weight: 600;
}
.list-heading {
  display: grid;
  grid-template-columns: 73px 1fr 105px;
  padding: 15px 24px;
  font-size: 12px;
  color: var(--muted);
  background: var(--surface-raised);
}
.list-heading span:last-child {
  text-align: right;
  padding-right: 25px;
}
.level-row {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 52px 160.8px minmax(0, 1fr) auto 15px;
  gap: 20px;
  align-items: center;
  padding: 19px 22px;
  min-height: 112px;
  transition: background 0.15s;
}
.level-row:hover {
  background: var(--surface-raised);
}
.rank {
  font-size: 25px;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: -0.045em;
}
.top-rank .rank {
  color: var(--accent);
}
.thumbnail {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 9px;
  overflow: hidden;
}
.level-info {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.level-info strong {
  font-size: 18px;
  font-weight: 600;
  overflow-wrap: anywhere;
  line-height: 1.3;
}
.level-info > span {
  font-size: 13px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.level-info small {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
  min-width: 0;
}
.global-rank {
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 4px 9px;
  font-size: inherit;
  color: var(--muted);
  white-space: nowrap;
}
.mobile-global-label {
  display: none;
}
.row-chevron {
  color: var(--muted);
}
.empty-state h3 {
  margin: 14px 0 6px;
}
.empty-state p {
  font-size: 14px;
  margin: 0;
}
@media (max-width: 1150px) {
  .level-row {
    grid-template-columns: 43px 126px minmax(0, 1fr) auto;
    gap: 14px;
    padding: 16px;
  }
  .thumbnail {
    height: auto;
  }
  .row-chevron {
    display: none;
  }
  .rank {
    font-size: 21px;
  }
  .level-info strong {
    font-size: 16px;
  }
  .list-heading {
    grid-template-columns: 56px 1fr 80px;
    padding: 14px 16px;
  }
  .list-heading span:last-child {
    padding-right: 0;
  }
}
@media (max-width: 540px) {
  .level-entry {
    flex-wrap: wrap;
  }
  .row-actions {
    width: 100%;
    padding: 0 12px 10px;
    justify-content: flex-end;
  }
  .level-row {
    grid-template-columns: minmax(34px, max-content) 94.8px minmax(0, 1fr);
    gap: 8px 10px;
    padding: 16px 12px;
    min-height: 106px;
    position: relative;
  }
  .thumbnail {
    height: auto;
    grid-column: 2;
    grid-row: 1;
  }
  .rank {
    grid-column: 1;
    grid-row: 1;
    font-size: 16px;
    text-align: left;
    white-space: nowrap;
  }
  .level-info strong {
    font-size: 15px;
    padding-right: 0;
  }
  .level-info > span {
    font-size: 12px;
  }
  .level-info small {
    font-size: 10px;
  }
  .level-info .victor-line {
    display: block;
  }
  .global-rank {
    position: static;
    justify-self: start;
    margin-top: 0;
    padding: 0;
    border: 0;
    font-size: 12px;
  }
  .level-numbers {
    grid-column: 2 / -1;
    grid-row: 2;
    justify-content: flex-end;
    gap: 12px;
    font-size: 12px;
  }
  .level-info {
    grid-column: 3;
    grid-row: 1;
    padding-block: 4px;
  }
  .list-heading {
    grid-template-columns: 47px 1fr 60px;
    padding: 12px;
  }
  .list-heading span:last-child {
    display: none;
  }
  .global-label {
    display: none;
  }
  .mobile-global-label {
    display: inline;
  }
}
</style>
