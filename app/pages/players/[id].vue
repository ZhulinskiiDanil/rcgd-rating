<script setup lang="ts">
import {
  completedLevels,
  effectivePercent,
  hasLevelPage,
  hypotheticalPosition,
  listTier,
  withinListBoundary,
  listBoundary,
} from "#shared/utils/rating";
import { formatScore, formatPosition } from "#shared/utils/presentation";
import { regionalFirstVictors } from "#shared/utils/victors";
import { recordVideoUrl } from "#shared/utils/record-video";
const route = useRoute(),
  id = Number(route.params.id);
const { data } = await useCatalog();
const boundary = computed(() => listBoundary(data.value?.levels ?? []));
const { data: session } = await useAccount();
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
const orderedLevels = computed(() =>
  data.value
    ? completedLevels({
        ...data.value,
        records: data.value.records.map((record) => ({ ...record, note: "" })),
      })
    : [],
);
const eligibleProgressIds = computed(() => {
  if (!data.value) return new Set<number>();
  const catalog = {
    ...data.value,
    records: data.value.records.map((record) => ({ ...record, note: "" })),
  };
  return new Set(
    catalog.records
      .filter((record) => {
        const level = levelMap.value.get(record.levelId);
        const progress = effectivePercent(record);
        if (
          record.playerId !== id ||
          !level ||
          !withinListBoundary(level, data.value!.levels, boundary.value) ||
          level.globalRank === null ||
          level.globalRank > 150 ||
          progress <= 0 ||
          progress >= 100
        )
          return false;
        const position = hypotheticalPosition(level, orderedLevels.value);
        return position !== null && position <= 150;
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
          (first.localRank ??
            hypotheticalPosition(first, orderedLevels.value) ??
            Infinity) -
            (second.localRank ??
              hypotheticalPosition(second, orderedLevels.value) ??
              Infinity) ||
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
const progresses = computed(
  () => allRecords.value.filter((record) => percent(record) < 100).length,
);
const hardestResult = computed(() =>
  player.value?.top.find((result) => result.levelId !== null),
);
const hardest = computed(() =>
  hardestResult.value?.levelId
    ? levelMap.value.get(hardestResult.value.levelId)
    : completed.value[0]
      ? levelMap.value.get(completed.value[0].levelId)
      : null,
);
const hardestPosition = computed(() =>
  hardest.value?.status === "legacy"
    ? null
    : hardest.value
      ? (hardest.value.localRank ??
        hypotheticalPosition(hardest.value, orderedLevels.value))
      : null,
);
const records = computed(() =>
  allRecords.value.filter((record) => {
    const level = levelMap.value.get(record.levelId)!;
    return (
      (tier.value === "all" ||
        (listTier(level) ??
          ((hypotheticalPosition(level, orderedLevels.value) ?? Infinity) <= 75
            ? "main"
            : "extended")) === tier.value) &&
      (outcome.value === "all" ||
        (outcome.value === "first"
          ? firstRecordIds.value.includes(record.id)
          : outcome.value === "completed"
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
const firstRegionLabel = computed(() =>
  playerDistrict.value?.region === "spb"
    ? "Первый в Санкт-Петербурге"
    : playerDistrict.value?.region === "lo"
      ? "Первый в Ленинградской области"
      : "Первый в регионе",
);
const profileLevels = computed(() =>
  records.value.map((record) => levelMap.value.get(record.levelId)!),
);
const personalResults = computed(() =>
  Object.fromEntries(
    records.value.map((record) => {
      const level = levelMap.value.get(record.levelId)!;
      return [
        record.levelId,
        {
          percent: percent(record),
          position:
            level.status === "legacy"
              ? null
              : (level.localRank ??
                hypotheticalPosition(level, orderedLevels.value)),
          recordId: record.id,
          video: recordVideoUrl(record),
          achievedAt: record.achievedAt,
          isFirstRk: !!record.isFirstRk,
        },
      ];
    }),
  ),
);
const completedLevelIds = computed(
  () => new Set(completed.value.map((record) => record.levelId)),
);
const firstLevelIds = computed(
  () =>
    new Set(
      allRecords.value
        .filter((record) => firstRecordIds.value.includes(record.id))
        .map((record) => record.levelId),
    ),
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
      <NuxtLink
        v-if="session?.user?.playerId === player.id"
        to="/account/settings"
        class="button secondary"
        >Настройки профиля</NuxtLink
      >
    </header>
    <div class="identity">
      <UserAvatar :name="player.name" :url="player.avatar" size="large" />
      <div class="identity-text">
        <h1 :class="{ inactive: player.inactive }">{{ player.name }}</h1>
        <p v-if="player.role" class="role-label">
          {{
            player.role === "head-admin"
              ? "Главный администратор"
              : "Администратор"
          }}
        </p>
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
      ><NuxtLink
        v-if="hardest && hasLevelPage(hardest)"
        :to="`/levels/${hardest.id}`"
        >{{ hardest.name }}</NuxtLink
      ><strong v-else-if="hardest">{{ hardest.name }}</strong
      ><strong v-else>Нет результатов</strong
      ><span v-if="hardestResult?.kind === 'progress'"
        >{{ formatPosition(hardestResult.percent) }}%</span
      ><span v-if="hardestPosition">#{{ hardestPosition }} в СПб</span>
    </div>
    <dl class="profile-stats">
      <div>
        <dt>Место в рейтинге</dt>
        <dd class="accent">
          {{ player.rank === null ? "Без места" : "#" + player.rank }}
        </dd>
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
      <div v-if="legacyCount">
        <dt>Legacy list</dt>
        <dd>{{ legacyCount }}</dd>
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
          <option v-if="playerDistrict" value="first">
            {{ firstRegionLabel }}
          </option>
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
        ><span class="first-key">{{ firstRegionLabel }}</span
        ><span v-if="progresses" class="progress-key"
          >Прогрессы: {{ progresses }}</span
        >
      </p>
    </div>
    <div class="records-panel panel">
      <LevelTable
        :levels="profileLevels"
        :results="personalResults"
        :completed="completedLevelIds"
        :first="firstLevelIds"
        :first-region-label="firstRegionLabel"
      />
    </div>
    <RatingHistory :id="id" type="players" />
  </section>
</template>
<style scoped lang="scss">
.inactive {
  color: var(--danger);
}
.role-label {
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
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
