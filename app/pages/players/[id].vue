<script setup lang="ts">
import {
  completedLevels,
  effectivePercent,
  hasLevelPage,
  hypotheticalPosition,
  listTier,
  progressPosition,
} from "#shared/utils/rating";
import { formatScore } from "#shared/utils/presentation";
import { regionalFirstVictors } from "#shared/utils/victors";
const route = useRoute(),
  id = Number(route.params.id);
const { data } = await useCatalog();
const player = computed(() => data.value?.players.find((p) => p.id === id));
if (!player.value)
  throw createError({ statusCode: 404, statusMessage: "Игрок не найден" });
const outcome = ref(
    route.query.filter === "completed" || route.query.filter === "progress"
      ? route.query.filter
      : "all",
  ),
  tier = ref("all");
watch(
  () => route.query.filter,
  (filter) => {
    outcome.value =
      filter === "completed" || filter === "progress" ? filter : "all";
  },
);
const levelMap = computed(
  () => new Map(data.value?.levels.map((level) => [level.id, level]) ?? []),
);
const eligibleProgressIds = computed(() => {
  if (!data.value) return new Set<number>();
  const catalog = {
    ...data.value,
    records: data.value.records.map((record) => ({ ...record, note: "" })),
  };
  const orderedLevels = completedLevels(catalog);
  return new Set(
    catalog.records
      .filter((record) => {
        const level = levelMap.value.get(record.levelId);
        const progress = effectivePercent(record);
        if (
          record.playerId !== id ||
          !level ||
          level.globalRank === null ||
          level.globalRank > 150 ||
          progress <= 0 ||
          progress >= 100
        )
          return false;
        const position = hypotheticalPosition(level, orderedLevels);
        return (
          position !== null &&
          progressPosition(
            position,
            progress,
            level.listPercent,
            level.endPercent,
          ) !== null
        );
      })
      .map((record) => record.id),
  );
});
const allRecords = computed(
  () =>
    data.value?.records
      .filter((r) => {
        const level = levelMap.value.get(r.levelId);
        return (
          r.playerId === id &&
          r.active &&
          !r.deletedAt &&
          level &&
          (hasLevelPage(level) || eligibleProgressIds.value.has(r.id))
        );
      })
      .sort((a, b) => {
        const first = levelMap.value.get(a.levelId)!;
        const second = levelMap.value.get(b.levelId)!;
        return (
          Number(listTier(first) === "legacy") -
            Number(listTier(second) === "legacy") ||
          (first.localRank ?? first.globalRank ?? Infinity) -
            (second.localRank ?? second.globalRank ?? Infinity) ||
          first.name.localeCompare(second.name)
        );
      }) ?? [],
);
const percent = (record: (typeof allRecords.value)[number]) =>
  effectivePercent({ ...record, note: "" });
const completed = computed(() =>
  allRecords.value.filter((record) => percent(record) === 100),
);
const mainCount = computed(
  () =>
    completed.value.filter(
      (record) => listTier(levelMap.value.get(record.levelId)!) === "main",
    ).length,
);
const extendedCount = computed(
  () =>
    completed.value.filter(
      (record) => listTier(levelMap.value.get(record.levelId)!) === "extended",
    ).length,
);
const legacyCount = computed(
  () =>
    completed.value.filter(
      (record) => listTier(levelMap.value.get(record.levelId)!) === "legacy",
    ).length,
);
const progresses = computed(() => eligibleProgressIds.value.size);
const hardest = computed(() =>
  completed.value[0] ? levelMap.value.get(completed.value[0].levelId) : null,
);
const records = computed(() =>
  allRecords.value.filter((record) => {
    const level = levelMap.value.get(record.levelId)!;
    return (
      (tier.value === "all" || listTier(level) === tier.value) &&
      (outcome.value === "all" ||
        (outcome.value === "completed"
          ? percent(record) === 100
          : percent(record) < 100))
    );
  }),
);
const firstRecordIds = computed(() =>
  data.value
    ? completed.value
        .filter((record) =>
          regionalFirstVictors(data.value!, record.levelId).some((region) =>
            region.victors.some((victor) => victor.playerId === id),
          ),
        )
        .map((record) => record.id)
    : [],
);
const playerDistrict = computed(() =>
  data.value?.districts.find(
    (district) => district.id === player.value?.districtId,
  ),
);
const districtHasPage = computed(
  () =>
    playerDistrict.value &&
    playerDistrict.value.completionCount +
      playerDistrict.value.legacyCompletionCount >
      0,
);
useHead({ title: () => `${player.value?.name} · СПб Demonlist` });
</script>
<template>
  <section v-if="player && data">
    <header class="detail-toolbar">
      <NuxtLink to="/players" class="back-link"
        ><AppIcon name="arrow" /> Рейтинг игроков</NuxtLink
      >
      <EntityEditButton
        resource="players"
        :entity-id="player.id"
        label="Редактировать игрока"
      />
    </header>
    <div class="identity">
      <UserAvatar :name="player.name" :url="player.avatar" size="large" />
      <div class="identity-text">
        <h1 :class="{ inactive: player.inactive }">{{ player.name }}</h1>
        <p v-if="player.inactive" class="inactive-note">Неактивный игрок</p>
        <div class="district">
          <AppIcon name="map" /><NuxtLink
            v-if="player.districtId && districtHasPage"
            :to="'/districts/' + player.districtId"
            >{{ player.districtName }}</NuxtLink
          ><span v-else>{{ player.districtName || "Район не назначен" }}</span>
        </div>
      </div>
      <a
        v-if="player.gdlId"
        class="global-profile"
        :href="'https://demonlist.org/profile/' + player.gdlId"
        target="_blank"
        rel="noopener"
        ><AppIcon name="globe" /> Global Demonlist <AppIcon name="external"
      /></a>
    </div>
    <p v-if="player.bio" class="bio">{{ player.bio }}</p>
    <div class="hardest-panel">
      <span>Хардест</span
      ><NuxtLink v-if="hardest" :to="`/levels/${hardest.id}`">{{
        hardest.name
      }}</NuxtLink
      ><strong v-else>Нет прохождений</strong>
    </div>
    <dl class="profile-stats">
      <div>
        <dt>Место в рейтинге</dt>
        <dd class="accent">#{{ player.rank }}</dd>
      </div>
      <div>
        <dt>Рейтинговый балл</dt>
        <dd>{{ formatScore(player.score) }}</dd>
      </div>
      <div>
        <dt>Прохождения в топ-150</dt>
        <dd>{{ mainCount + extendedCount }}</dd>
        <small
          >Main list: {{ mainCount }} · Extended list:
          {{ extendedCount }}</small
        >
      </div>
      <div>
        <dt>Legacy list</dt>
        <dd>{{ legacyCount }}</dd>
      </div>
      <div>
        <dt>Прогрессы в топ-150</dt>
        <dd>{{ progresses }}</dd>
      </div>
    </dl>
    <div class="section-heading">
      <h2>Шесть лучших результатов</h2>
      <span>Прохождения и прогрессы</span>
    </div>
    <RatingBreakdown :rating="player" :levels="data.levels" />
    <ForecastCalculator entity-type="players" :entity-id="id" />
    <div class="section-heading">
      <h2>
        Достижения <span class="count">{{ records.length }}</span>
      </h2>
      <EntityEditButton
        resource="records"
        label="Добавить рекорд"
        :defaults="{ playerId: player.id }"
      />
    </div>
    <div class="achievement-filters">
      <label
        >Результат<select v-model="outcome">
          <option value="all">Все результаты</option>
          <option value="completed">Пройденные уровни</option>
          <option value="progress">Прогрессы</option>
        </select></label
      >
      <label
        >Раздел<select v-model="tier">
          <option value="all">Все разделы</option>
          <option value="main">Main list</option>
          <option value="extended">Extended list</option>
          <option value="legacy">Legacy list</option>
        </select></label
      >
      <p>
        <span class="complete-key">Пройден</span
        ><span class="first-key">Первый в городе или области</span>
      </p>
    </div>
    <div class="records-panel panel">
      <RecordsTable
        :records="records"
        :players="data.players"
        :levels="data.levels"
        highlight-completions
        :first-record-ids="firstRecordIds"
      />
    </div>
    <RatingHistory :id="id" type="players" />
  </section>
</template>
<style scoped lang="scss">
.inactive,
.inactive-note {
  color: var(--danger);
}
.inactive-note {
  font-size: 14px;
  margin: 0 0 10px;
}
.hardest-panel {
  display: flex;
  gap: 12px 24px;
  align-items: baseline;
  flex-wrap: wrap;
  margin-top: 28px;
  span {
    color: var(--muted);
    font-size: 15px;
  }
  a,
  strong {
    font-size: 22px;
    font-weight: 600;
  }
}
.achievement-filters {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 22px;
  label {
    display: grid;
    gap: 8px;
    font-size: 14px;
    min-width: 190px;
  }
  select {
    font-size: 16px;
  }
  p {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 0;
    font-size: 13px;
    span {
      padding-left: 10px;
      border-left: 3px solid;
    }
  }
  .complete-key {
    border-color: var(--success);
  }
  .first-key {
    border-color: var(--warm);
  }
}
.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.back-link {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 15px;
  color: var(--muted);
  text-decoration: none;
  :deep(svg) {
    width: 15px;
    transform: rotate(180deg);
  }
  &:hover {
    color: var(--accent);
  }
}
.identity {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 30px;
}
.identity-text {
  min-width: 0;
  h1 {
    margin: 0 0 10px;
    overflow-wrap: anywhere;
  }
}
.district {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 15px;
  :deep(svg) {
    width: 15px;
    height: 15px;
  }
  a {
    color: var(--muted);
    text-decoration: none;
    &:hover {
      color: var(--accent);
    }
  }
}
.global-profile {
  margin-left: auto;
  display: inline-flex;
  gap: 9px;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--muted);
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;
  :deep(svg) {
    width: 15px;
  }
  &:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
}
.bio {
  color: var(--muted);
  font-size: 16px;
  margin: 22px 0 0;
  max-width: 74ch;
  white-space: pre-line;
}
.profile-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 30px 0 0;
  padding: 23px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  > div {
    padding: 0 24px;
    border-left: 1px solid var(--line);
    &:first-child {
      padding-left: 0;
      border-left: 0;
    }
  }
  dt {
    color: var(--muted);
    font-size: 14px;
  }
  small {
    display: block;
    margin-top: 8px;
    color: var(--muted);
    line-height: 1.5;
    font-size: 13px;
  }
  dd {
    margin: 8px 0 0;
    color: var(--text);
    font-size: clamp(26px, 3vw, 38px);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    letter-spacing: -0.6px;
    &.accent {
      color: var(--warm);
    }
  }
}
.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin: 48px 0 22px;
  h2 {
    font-size: 24px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  > span {
    color: var(--muted);
    font-size: 14px;
  }
}
.count {
  background: var(--surface-raised);
  color: var(--muted);
  border-radius: 5px;
  padding: 3px 7px;
  font:
    14px/1.4 "Golos Text",
    sans-serif;
}
.records-panel {
  overflow: hidden;
  :deep(.table-wrap) {
    border: 0;
    border-radius: 0;
  }
}
@media (max-width: 720px) {
  .profile-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px 0;
    > div:nth-child(odd) {
      padding-left: 0;
      border-left: 0;
    }
  }
  .identity {
    flex-wrap: wrap;
    gap: 18px;
  }
  .global-profile {
    margin-left: 0;
  }
  .profile-stats > div {
    padding: 0 16px;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
@media (max-width: 520px) {
  .identity {
    margin-top: 22px;
  }
  .identity-text h1 {
    font-size: 32px;
  }
  .profile-stats {
    grid-template-columns: 1fr 1fr;
    gap: 20px 0;
    padding: 22px 0;
    > div:nth-child(3) {
      border-left: 0;
      padding-left: 0;
    }
    dd {
      font-size: 23px;
    }
  }
  .section-heading h2 {
    font-size: 20px;
  }
}
</style>
