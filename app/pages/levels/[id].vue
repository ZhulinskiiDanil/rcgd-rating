<script setup lang="ts">
import { recordVideoUrl } from "#shared/utils/record-video";
import {
  completedLevels,
  hasLevelPage,
  isCurrentLevel,
  effectivePercent,
  hypotheticalPosition,
} from "#shared/utils/rating";
import {
  compareCompletionDates,
  formatCompletionDate,
  firstLevelVictors,
  regionalFirstVictors,
} from "#shared/utils/victors";
const id = Number(useRoute().params.id);
const { data } = await useCatalog();
const level = computed(() => data.value?.levels.find((l) => l.id === id));
if (!level.value || !hasLevelPage(level.value))
  throw createError({ statusCode: 404, statusMessage: "Уровень не найден" });
const records = computed(() =>
  (
    data.value?.records.filter((r) => r.levelId === id && r.active) ?? []
  ).toSorted(
    (a, b) =>
      effectivePercent({ ...b, note: "" }) -
        effectivePercent({ ...a, note: "" }) ||
      compareCompletionDates(a.achievedAt, b.achievedAt),
  ),
);
const completionVideo = computed(() => {
  const record = records.value.find(
    (r) => effectivePercent({ ...r, note: "" }) === 100 && recordVideoUrl(r),
  );
  return record ? recordVideoUrl(record) : "";
});
const completions = computed(
  () =>
    records.value.filter((r) => effectivePercent({ ...r, note: "" }) === 100)
      .length,
);
const firstVictors = computed(() =>
  data.value ? regionalFirstVictors(data.value, id) : [],
);
const overallFirst = computed(() =>
  data.value ? firstLevelVictors(data.value, id) : null,
);
const verifier = computed(() =>
  data.value?.players.find(
    (player) => player.id === level.value?.verificationPlayerId,
  ),
);
const h = computed(() =>
  data.value && level.value
    ? hypotheticalPosition(
        level.value,
        completedLevels({
          ...data.value,
          records: data.value.records.map((r) => ({ ...r, note: "" })),
        }),
      )
    : null,
);
const neighbors = computed(() => {
  const ranked =
    data.value?.levels
      .filter((item) => isCurrentLevel(item) && item.localRank)
      .sort((a, b) => a.localRank! - b.localRank!) ?? [];
  const index = ranked.findIndex((item) => item.id === id);
  return {
    previous: index > 0 ? ranked[index - 1] : null,
    next: index >= 0 ? ranked[index + 1] : null,
  };
});
const statusLabel = computed(() =>
  level.value?.status === "main"
    ? "Main list"
    : level.value?.status === "extended"
      ? "Extended list"
      : "Legacy list",
);
const lengthLabel = computed(() =>
  level.value?.length
    ? `${Math.floor(level.value.length / 60)}:${String(Math.round(level.value.length % 60)).padStart(2, "0")}`
    : "Не указана",
);
useHead({ title: () => `${level.value?.name} · СПб Demonlist` });
</script>

<template>
  <section v-if="level && data" class="level-page">
    <header class="detail-toolbar">
      <nav class="breadcrumbs" aria-label="Навигация по уровню">
        <NuxtLink
          :to="{
            path: '/demonlist',
            query: level.status === 'main' ? {} : { list: level.status },
          }"
          ><AppIcon :name="level.status === 'legacy' ? 'archive' : 'list'" />{{
            statusLabel
          }}</NuxtLink
        >
        <AppIcon name="chevron" /><span>{{ level.name }}</span>
      </nav>
      <div class="level-actions">
        <EntityEditButton
          resource="levels"
          :entity-id="level.id"
          label="Редактировать уровень"
        /><EntityDeleteButton
          resource="levels"
          :entity-id="level.id"
          label="Убрать из листа"
        />
      </div>
    </header>
    <nav
      v-if="neighbors.previous || neighbors.next"
      class="level-pagination"
      aria-label="Соседние уровни"
    >
      <NuxtLink
        v-if="neighbors.previous"
        :to="`/levels/${neighbors.previous.id}`"
        class="previous"
        ><AppIcon name="arrow" /><span
          ><small>Сложнее</small
          ><strong>{{ neighbors.previous.name }}</strong></span
        ><span class="neighbor-rank"
          >#{{ neighbors.previous.localRank }}</span
        ></NuxtLink
      ><NuxtLink
        v-if="neighbors.next"
        :to="`/levels/${neighbors.next.id}`"
        class="next"
        ><span class="neighbor-rank">#{{ neighbors.next.localRank }}</span
        ><span
          ><small>Легче</small><strong>{{ neighbors.next.name }}</strong></span
        ><AppIcon name="arrow"
      /></NuxtLink>
    </nav>
    <div class="level-hero panel">
      <div class="hero-artwork">
        <LevelVideo :level="level" :fallback-video="completionVideo" />
        <section v-if="overallFirst?.hasCompletions" class="first-victor">
          <h2>
            {{
              overallFirst.victors.length
                ? overallFirst.victors.length > 1
                  ? "Первые викторы"
                  : "Первый виктор"
                : overallFirst.firstDate
                  ? "Первое известное прохождение"
                  : "Известные викторы"
            }}
          </h2>
          <div v-if="overallFirst.victors.length" class="first-victor-names">
            <NuxtLink
              v-for="victor in overallFirst.victors"
              :key="victor.playerId"
              :to="`/players/${victor.playerId}`"
              >{{ victor.name }}</NuxtLink
            >
          </div>
          <div
            v-else-if="
              !overallFirst.firstDate && overallFirst.knownVictors.length
            "
            class="first-victor-names"
          >
            <NuxtLink
              v-for="victor in overallFirst.knownVictors"
              :key="victor.playerId"
              :to="`/players/${victor.playerId}`"
              >{{ victor.name }}</NuxtLink
            >
          </div>
          <span v-else>Ник виктора не указан</span>
          <time
            v-if="overallFirst.firstDate"
            :datetime="overallFirst.firstDate"
            >{{ formatCompletionDate(overallFirst.firstDate) }}</time
          >
        </section>
      </div>
      <div class="hero-content">
        <div class="level-positions">
          <span v-if="level.localRank" class="local-rank"
            >#{{ level.localRank }} <span>в СПб</span></span
          >
          <span v-else class="unranked">Legacy list</span>
          <span v-if="level.globalRank" class="global-rank"
            ><AppIcon name="globe" />#{{ level.globalRank }} в Global
            Demonlist</span
          >
        </div>
        <h1>{{ level.name }}</h1>
        <p class="creator">
          {{
            level.creator ? `Опубликовано: ${level.creator}` : "Автор не указан"
          }}
        </p>
        <div v-if="level.verificationRegion" class="regional-verification">
          <AppIcon name="check" />
          <div>
            <strong
              >Верификация
              {{
                level.verificationRegion === "spb"
                  ? "в Санкт-Петербурге"
                  : "в Ленинградской области"
              }}</strong
            >
            <span>
              <NuxtLink v-if="verifier" :to="`/players/${verifier.id}`">{{
                verifier.name
              }}</NuxtLink>
              <time
                v-if="level.verificationDate"
                :datetime="level.verificationDate"
                >{{ formatCompletionDate(level.verificationDate) }}</time
              >
            </span>
          </div>
        </div>

        <RegionalVictors :rows="firstVictors" />
        <div class="hero-facts">
          <div>
            <strong>{{ completions }}</strong
            ><span>Прохождения</span>
          </div>
          <div
            v-if="
              level.globalRank !== null &&
              level.globalRank <= 150 &&
              records.length > completions
            "
          >
            <strong>{{ records.length - completions }}</strong
            ><span>Прогрессы</span>
          </div>
          <div>
            <strong class="entity-id">{{ level.ingameId || "—" }}</strong
            ><span>ID в игре</span>
          </div>
          <div>
            <strong>{{ lengthLabel }}</strong
            ><span>Длина</span>
          </div>
          <div>
            <strong>{{ level.gameVersion || "Не указана" }}</strong
            ><span>Версия игры</span>
          </div>
        </div>
        <div class="level-links">
          <a
            v-if="level.globalRank"
            :href="`https://demonlist.org/classic/${level.globalRank}`"
            target="_blank"
            rel="noopener noreferrer"
            >Global Demonlist<AppIcon name="external"
          /></a>
          <span class="status-tag">{{ statusLabel }}</span>
        </div>
      </div>
    </div>
    <div class="level-body">
      <section class="records-section">
        <div class="section-heading">
          <h2>Прохождения и прогрессы</h2>
          <span class="count">{{ records.length }}</span>
          <EntityEditButton
            resource="records"
            label="Добавить рекорд"
            :defaults="{ levelId: level.id }"
          />
        </div>
        <RecordsTable
          :records="records"
          :players="data.players"
          :levels="data.levels"
        />
      </section>
      <aside class="threshold-panel panel">
        <template v-if="level.status === 'legacy'"
          ><h2>Legacy</h2>
          <p>Новые рекорды для этого уровня больше не принимаются.</p>
          <p v-if="level.exitedAt" class="muted">
            Вылетел
            {{
              new Date(level.exitedAt).toLocaleDateString("ru-RU", {
                timeZone: "Europe/Moscow",
              })
            }}.
          </p></template
        >
        <template v-else
          ><h2>Зачёт прогресса</h2>
          <dl>
            <div>
              <dt>Лист-процент</dt>
              <dd>
                {{ level.listPercent === null ? "—" : level.listPercent + "%" }}
              </dd>
            </div>
            <div>
              <dt>Конец уровня</dt>
              <dd>
                {{ level.endPercent === null ? "—" : level.endPercent + "%" }}
              </dd>
            </div>
            <div>
              <dt>Место для расчёта</dt>
              <dd>{{ h ?? "—" }}</dd>
            </div>
          </dl>
          <p v-if="level.globalRank === null">
            Прогрессы станут доступны после появления уровня в глобальном листе.
          </p>
          <p v-else-if="level.globalRank > 150">
            Прогрессы не участвуют в рейтинге: уровень вне глобального топа-150.
          </p>
          <p
            v-else-if="level.listPercent === null || level.endPercent === null"
          >
            Проценты Coreboard пока не сопоставлены.
          </p>
          <p v-else>
            Для расчёта берётся место, которое уровень занял бы среди пройденных
            в городе и области.
          </p>
          <NuxtLink to="/rules" class="rules-link"
            >Как считается рейтинг<AppIcon name="chevron" /></NuxtLink
        ></template>
      </aside>
    </div>
    <LevelHistory :level-id="level.id" />
  </section>
</template>

<style scoped lang="scss">
.level-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.hero-facts .entity-id {
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
}
.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.detail-toolbar {
  margin-bottom: 32px;
}
.first-victor {
  width: 100%;
  margin: 0;
  padding: 24px;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  h2 {
    margin: 0 0 10px;
    font: inherit;
    font-size: 14px;
    color: var(--muted);
  }
  time {
    display: block;
    margin-top: 8px;
    font-size: 15px;
  }
  p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
  }
}
.first-victor-names {
  display: flex;
  gap: 6px 16px;
  flex-wrap: wrap;
  a {
    color: var(--accent);
    font-weight: 600;
    font-size: 22px;
    overflow-wrap: anywhere;
  }
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  font-size: 15px;
  margin-bottom: 0;
  flex-wrap: wrap;
  overflow-wrap: anywhere;
  a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  > svg {
    width: 13px;
  }
}
.level-hero {
  display: grid;
  grid-template-columns: 49.5% minmax(0, 1fr);
  align-items: start;
  overflow: hidden;
  padding: 0;
}
.hero-artwork {
  min-width: 0;
  align-self: start;
  position: relative;
  :deep(.level-artwork) {
    height: 100%;
    width: 100%;
  }
}
.showcase-link {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 20px;
  color: var(--art-text);
  background: linear-gradient(
    180deg,
    transparent 40%,
    color-mix(in srgb, var(--accent), transparent 25%) 100%
  );
  text-decoration: none;
  > span:last-child {
    position: absolute;
    bottom: 20px;
    left: 22px;
    right: 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 16px;
  }
  &:hover .play-icon {
    background: var(--accent);
    color: var(--art-text);
  }
}
.play-icon {
  display: grid;
  place-items: center;
  width: 82px;
  height: 82px;
  border: 1px solid color-mix(in srgb, var(--art-text), transparent 35%);
  background: color-mix(in srgb, var(--accent), transparent 30%);
  border-radius: 50%;
  backdrop-filter: blur(8px);
  transition: background 0.15s;
  svg {
    width: 26px;
    height: 26px;
  }
}
.hero-content {
  min-width: 0;
  padding: clamp(26px, 3vw, 50px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  > * {
    flex-shrink: 0;
    max-width: 100%;
  }
  h1 {
    width: 100%;
    overflow: visible;
    font-size: clamp(32px, 3.9vw, 66px);
    line-height: 1.14;
    margin: 28px 0 16px;
    overflow-wrap: anywhere;
  }
}
.level-positions {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  align-items: center;
}
.local-rank {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  span {
    font-size: 15px;
    font-weight: 500;
  }
}
.global-rank {
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  svg {
    width: 14px;
    height: 14px;
  }
}
.unranked {
  color: var(--accent);
  font-size: 15px;
}
.creator {
  color: var(--muted);
  margin: 0 0 26px;
  font-size: 16px;
}
.regional-verification {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--success);
  margin: 0 0 28px;
  font-size: 14px;
  > svg {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }
  strong {
    font-weight: 500;
  }
  span {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 5px;
  }
  time {
    color: var(--muted);
  }
}
.hero-facts {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  margin-bottom: 26px;
  div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  strong {
    font-size: 24px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  span {
    font-size: 14px;
    color: var(--muted);
  }
}
.level-links {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: auto;
  font-size: 14px;
  a {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    svg {
      width: 14px;
      height: 14px;
    }
  }
}
.status-tag {
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 3px 8px;
}
.level-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  align-items: start;
  gap: 28px;
  margin-top: 48px;
}
.records-section {
  min-width: 0;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 15px;
  h2 {
    margin: 0;
    font-size: 22px;
  }
}
.count {
  border-radius: 5px;
  color: var(--muted);
  background: var(--surface-raised);
  padding: 2px 7px;
  font-size: 14px;
}
.verification-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  line-height: 1.6;
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 20px;
  svg {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    margin-top: 2px;
    color: var(--accent);
  }
}
.threshold-panel {
  padding: 22px;
  h2 {
    font-size: 18px;
    margin: 0 0 22px;
  }
  dl {
    margin: 0;
  }
  dl > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  dt {
    color: var(--muted);
    font-size: 14px;
    span {
      opacity: 0.65;
      margin-left: 4px;
      font-style: italic;
    }
  }
  dd {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  > p {
    font-size: 14px;
    line-height: 1.7;
    color: var(--muted);
    margin: 18px 0;
  }
  > p.threshold-warning {
    color: var(--warm);
  }
}
.rules-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  svg {
    width: 14px;
    height: 14px;
  }
}
.legacy-note {
  display: flex;
  gap: 10px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  font-size: 14px;
  line-height: 1.7;
  > svg {
    flex-shrink: 0;
    width: 17px;
    height: 17px;
    color: var(--warm);
  }
  strong {
    font-weight: 500;
    color: var(--warm);
  }
  p {
    margin: 8px 0;
    color: var(--muted);
  }
  span {
    color: var(--muted);
    font-size: 13px;
  }
}
.level-pagination {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin: 0 0 22px;
  a {
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--text);
    text-decoration: none;
    min-width: 0;
    padding: 10px 0;
    > span:not(.neighbor-rank) {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }
    small {
      color: var(--muted);
      font-size: 14px;
    }
    strong {
      font-size: 17px;
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    > svg {
      flex-shrink: 0;
      width: 17px;
      color: var(--muted);
    }
    &:hover strong {
      color: var(--accent);
    }
  }
  .previous > svg {
    transform: rotate(180deg);
  }
  .next {
    grid-column: 2;
    justify-content: flex-end;
    text-align: right;
  }
}
.neighbor-rank {
  color: var(--muted);
  font-size: 15px;
}
@media (max-width: 1050px) {
  .level-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .threshold-panel {
    max-width: none;
  }
  .threshold-panel dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .hero-content {
    padding: 26px;
  }
  .hero-facts {
    gap: 18px;
  }
}
@media (max-width: 850px) {
  .level-hero {
    grid-template-columns: minmax(0, 1fr);
  }
  .hero-artwork {
    min-height: 0;
  }
  .hero-content {
    padding: 24px;
    h1 {
      margin-top: 18px;
    }
  }
  .level-body {
    gap: 24px;
  }
  .threshold-panel dl {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .neighbor-rank {
    display: none;
  }
  .section-heading h2 {
    font-size: 20px;
  }
  .level-pagination {
    gap: 12px;
    a {
      gap: 10px;
    }
  }
}
</style>
