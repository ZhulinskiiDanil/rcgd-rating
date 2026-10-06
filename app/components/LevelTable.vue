<script setup lang="ts">
import type { Level } from "#shared/types/domain";
withDefaults(
  defineProps<{
    levels: Level[];
    legacy?: boolean;
    completionCounts?: Record<number, number>;
  }>(),
  { completionCounts: () => ({}) },
);
const exitDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })
    : "Неизвестно";
const completionWord = (count: number) => {
  const form = new Intl.PluralRules("ru").select(count);
  return form === "one"
    ? "прохождение"
    : form === "few"
      ? "прохождения"
      : "прохождений";
};
</script>
<template>
  <div class="level-list">
    <div v-if="levels.length" class="list-heading">
      <span>Место</span><span>Уровень</span
      ><span>{{ legacy ? "Дата выхода" : "Глобал" }}</span>
    </div>
    <div v-for="level in levels" :key="level.id" class="level-entry">
      <NuxtLink
        :to="`/levels/${level.id}`"
        class="level-row"
        :class="{ 'top-rank': level.localRank === 1 }"
      >
        <span class="rank">{{
          level.localRank
            ? "#" + level.localRank
            : level.lastMainRank
              ? "#" + level.lastMainRank
              : "—"
        }}</span>
        <span class="thumbnail"><LevelArtwork :level="level" /></span>
        <span class="level-info"
          ><strong>{{ level.name }}</strong
          ><span>{{ level.creator || "Автор не указан" }}</span
          ><small v-if="completionCounts[level.id]"
            ><AppIcon name="check" :size="11" />
            {{ completionCounts[level.id] }}
            {{ completionWord(completionCounts[level.id]!) }}</small
          ></span
        >
        <span class="global-rank">{{
          legacy
            ? exitDate(level.exitedAt)
            : level.globalRank
              ? "#" + level.globalRank
              : "—"
        }}</span
        ><AppIcon class="row-chevron" name="chevron" :size="15" />
      </NuxtLink>
      <div class="row-actions">
        <EntityEditButton
          resource="levels"
          :entity-id="level.id"
          :label="`Редактировать уровень ${level.name}`"
          compact
        />
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
  &:empty {
    display: none;
  }
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
  grid-template-columns: 52px 122px minmax(0, 1fr) auto 15px;
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
  height: 73px;
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
}
.global-rank {
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 4px 9px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
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
    grid-template-columns: 43px 95px minmax(0, 1fr) auto;
    gap: 14px;
    padding: 16px;
  }
  .thumbnail {
    height: 64px;
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
  .level-row {
    grid-template-columns: 35px 72px minmax(0, 1fr);
    gap: 12px;
    padding: 16px 12px;
    min-height: 106px;
    position: relative;
  }
  .thumbnail {
    height: 58px;
  }
  .rank {
    font-size: 18px;
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
  .global-rank {
    position: absolute;
    left: 60px;
    bottom: 6px;
    padding: 0;
    border: 0;
    font-size: 10px;
  }
  .level-info {
    padding-block: 4px;
  }
  .list-heading {
    grid-template-columns: 47px 1fr 60px;
    padding: 12px;
  }
  .list-heading span:last-child {
    display: none;
  }
}
</style>
