<script setup lang="ts">
import { hasLevelPage, isCurrentLevel, listTier } from "#shared/utils/rating";
import { formatScore } from "#shared/utils/presentation";
import { recordVideoUrl } from "#shared/utils/record-video";
import { compareCompletionDates, levelVictors } from "#shared/utils/victors";
const id = Number(useRoute().params.id);
const { data } = await useCatalog();
const district = computed(() => data.value?.districts.find((d) => d.id === id));
if (
  !district.value ||
  district.value.completionCount + district.value.legacyCompletionCount === 0
)
  throw createError({ statusCode: 404, statusMessage: "Район не найден" });
const players = computed(
  () => data.value?.players.filter((p) => p.districtId === id) ?? [],
);
const extras = computed(
  () =>
    data.value?.extras
      .filter((e) => e.districtId === id && !e.deletedAt)
      .toSorted((a, b) => compareCompletionDates(a.achievedAt, b.achievedAt)) ??
    [],
);
const districtLevels = computed(() => {
  if (!data.value) return [];
  const ids = new Set([
    ...completions.value.map((record) => record.levelId),
    ...extras.value.map((extra) => extra.levelId),
  ]);
  return data.value.levels
    .filter((level) => ids.has(level.id) && !level.listExcluded)
    .toSorted(
      (a, b) =>
        Number(!hasLevelPage(a)) - Number(!hasLevelPage(b)) ||
        Number(listTier(a) === "legacy") - Number(listTier(b) === "legacy") ||
        (a.localRank ?? a.globalRank ?? Infinity) -
          (b.localRank ?? b.globalRank ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
});
const victorsByLevel = computed(() =>
  Object.fromEntries(
    districtLevels.value.map((level) => [
      level.id,
      levelVictors(data.value!, level.id, id),
    ]),
  ),
);
const completions = computed(
  () =>
    data.value?.records.filter(
      (r) =>
        players.value.some((p) => p.id === r.playerId) &&
        r.active &&
        !r.deletedAt &&
        Math.max(r.manualPercent ?? 0, r.importedPercent ?? 0) === 100,
    ) ?? [],
);
const videosByLevel = computed(() => {
  const videos: Record<number, Record<number, string>> = {};
  for (const record of completions.value.toSorted((a, b) =>
    compareCompletionDates(a.achievedAt, b.achievedAt),
  )) {
    const url = recordVideoUrl(record);
    if (url) (videos[record.levelId] ??= {})[record.playerId] ||= url;
  }
  return videos;
});
const hardest = computed(() => districtLevels.value.find(hasLevelPage));
useHead({ title: () => `${district.value?.name} · СПб Demonlist` });
</script>
<template>
  <section v-if="district && data">
    <header class="detail-toolbar">
      <NuxtLink to="/districts" class="back-link"
        ><AppIcon name="arrow" /> Рейтинг районов</NuxtLink
      >
      <EntityEditButton
        resource="districts"
        :entity-id="district.id"
        label="Редактировать район"
      />
    </header>
    <div class="identity">
      <div class="identity-text">
        <h1>{{ district.name }}</h1>
        <p>
          {{
            district.region === "spb"
              ? "Санкт-Петербург"
              : "Ленинградская область"
          }}
        </p>
      </div>
    </div>
    <div class="hardest-panel">
      <span>Хардест района</span
      ><NuxtLink v-if="hardest" :to="`/levels/${hardest.id}`">{{
        hardest.name
      }}</NuxtLink
      ><span v-if="hardest?.localRank">#{{ hardest.localRank }} в СПб</span>
    </div>
    <dl class="profile-stats">
      <div>
        <dt>Место в рейтинге</dt>
        <dd class="accent">
          {{ district.rank === null ? "—" : "#" + district.rank }}
        </dd>
      </div>
      <div>
        <dt>Рейтинговый балл</dt>
        <dd v-if="district.completionCount">
          {{ formatScore(district.score) }}
        </dd>
        <dd v-else class="empty-rating">Нет прохождений в топ-150</dd>
      </div>
      <div>
        <dt>Игроков района</dt>
        <dd>{{ players.length }}</dd>
      </div>
      <div>
        <dt>Пройденных уровней</dt>
        <dd>{{ district.completionCount + district.legacyCompletionCount }}</dd>
        <DistrictCompletionCounts :district="district" />
      </div>
    </dl>
    <DistrictMap
      :districts="data.districts"
      :focus-district-id="district.id"
      static-view
    />
    <div class="section-heading">
      <h2>Шесть сложнейших прохождений</h2>
      <span>Каждый уровень — один раз</span>
    </div>
    <RatingBreakdown
      v-if="district.completionCount"
      :rating="district"
      :levels="data.levels"
      :victors-by-level="victorsByLevel"
      :show-formula="false"
    />
    <div class="section-heading">
      <h2>
        Игроки района <span class="count">{{ players.length }}</span>
      </h2>
      <EntityEditButton
        resource="players"
        label="Добавить игрока"
        :defaults="{ districtId: district.id }"
      />
    </div>
    <div class="panel members">
      <ul v-if="players.length">
        <li v-for="p in players" :key="p.id">
          <div class="member-row" :class="{ 'inactive-player': p.inactive }">
            <NuxtLink :to="'/players/' + p.id"
              ><span class="member-identity"
                ><UserAvatar :name="p.name" :url="p.avatar" /><strong>{{
                  p.name
                }}</strong></span
              ><span class="member-rating"
                ><span>{{ p.rank === null ? "—" : `#${p.rank}` }}</span
                >{{ formatScore(p.score)
                }}<AppIcon name="chevron" /></span></NuxtLink
            ><EntityEditButton
              resource="players"
              :entity-id="p.id"
              :label="`Редактировать игрока ${p.name}`"
              compact
            />
          </div>
        </li>
      </ul>
      <div v-else class="empty-note">
        <AppIcon name="users" />
        <p>
          Игроки пока не назначены этому району. Отдельно добавленные
          прохождения продолжают учитываться в рейтинге.
        </p>
      </div>
    </div>
    <div class="section-heading">
      <h2>
        Уровни и викторы <span class="count">{{ districtLevels.length }}</span>
      </h2>
    </div>
    <p class="section-description">
      Викторы каждого уровня перечислены по дате прохождения. Результаты без
      даты стоят в конце.
    </p>
    <div class="district-levels panel">
      <div
        v-for="level in districtLevels"
        :key="level.id"
        class="district-level"
      >
        <div class="district-level-name">
          <span v-if="isCurrentLevel(level)" class="level-position"
            >#{{ level.localRank }}</span
          >
          <div>
            <div class="entity-name">
              <NuxtLink
                v-if="hasLevelPage(level)"
                :to="`/levels/${level.id}`"
                >{{ level.name }}</NuxtLink
              ><span v-else class="unlisted-name">{{ level.name }}</span
              ><EntityEditButton
                resource="levels"
                :entity-id="level.id"
                :label="`Редактировать уровень ${level.name}`"
                compact
              />
            </div>
            <span v-if="hasLevelPage(level)" class="level-status">{{
              level.status === "main"
                ? "Main list"
                : level.status === "extended"
                  ? "Extended list"
                  : level.status === "legacy"
                    ? "Legacy list"
                    : "Вне основного листа"
            }}</span>
          </div>
        </div>
        <VictorList
          v-if="hasLevelPage(level)"
          :victors="victorsByLevel[level.id] ?? []"
          :video-urls="videosByLevel[level.id]"
        />
      </div>
      <div v-if="!districtLevels.length" class="empty-note">
        <AppIcon name="list" />
        <p>Прохождения этого района ещё не добавлены.</p>
      </div>
    </div>
    <RatingHistory :id="id" type="districts" />
    <ForecastCalculator
      entity-type="districts"
      :entity-id="id"
      :show-formula="false"
    />
  </section>
</template>
<style scoped lang="scss">
.hardest-panel {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-top: 26px;
  span {
    color: var(--muted);
    font-size: 15px;
  }
  a {
    font-size: 22px;
    font-weight: 600;
  }
}
.inactive-player .member-identity strong {
  color: var(--danger);
}
.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.entity-name {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
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
  p {
    color: var(--muted);
    font-size: 16px;
    margin: 0;
  }
}
.profile-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
    color: var(--muted);
    font-size: 13px;
    display: block;
    margin-top: 8px;
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
  .empty-rating {
    font-size: 16px;
    letter-spacing: normal;
    color: var(--muted);
    font-weight: 400;
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
.members {
  overflow: hidden;
  ul {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  li + li {
    border-top: 1px solid var(--line);
  }
  .member-row > a {
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    color: var(--text);
    text-decoration: none;
    &:hover {
      background: var(--accent-soft);
    }
  }
}
.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 20px;
  > a {
    flex: 1;
    min-width: 0;
  }
}
.member-identity {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  strong {
    font-size: 16px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
}
.member-rating {
  display: flex;
  flex-shrink: 0;
  gap: 26px;
  align-items: center;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  span {
    color: var(--muted);
  }
  :deep(svg) {
    width: 15px;
    color: var(--muted);
  }
}
.empty-note {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 23px 24px;
  color: var(--muted);
  font-size: 15px;
  p {
    margin: 0;
    max-width: 75ch;
  }
  :deep(svg) {
    flex-shrink: 0;
    width: 19px;
  }
}
.section-description {
  margin: -4px 0 20px;
  font-size: 15px;
  color: var(--muted);
  max-width: 78ch;
}
.district-levels {
  overflow: hidden;
}
.district-level {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
  align-items: start;
  gap: 20px;
  padding: 26px;
  & + & {
    border-top: 1px solid var(--line);
  }
  :deep(.victor-list),
  :deep(.unknown-victor) {
    margin-top: 0;
  }
}
.district-level-name {
  display: flex;
  gap: 20px;
  min-width: 0;
  > div {
    min-width: 0;
  }
  a,
  .unlisted-name {
    color: var(--text);
    font-weight: 600;
    font-size: 19px;
    text-decoration: none;
    overflow-wrap: anywhere;
    &:hover {
      color: var(--accent);
    }
  }
}
.level-position {
  color: var(--accent);
  font-size: 22px;
  min-width: 42px;
  font-variant-numeric: tabular-nums;
}
.level-status {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin-top: 6px;
}
@media (max-width: 720px) {
  .identity {
    gap: 18px;
  }
  .profile-stats > div {
    padding: 0 16px;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .district-level {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 22px;
  }
}
@media (max-width: 520px) {
  .identity {
    margin-top: 22px;
    align-items: flex-start;
  }
  .identity-text h1 {
    font-size: 28px;
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
  .members .member-row > a {
    padding: 16px;
  }
  .member-rating {
    gap: 12px;
  }
  .empty-note {
    padding: 20px 16px;
  }
}
</style>
