<script setup lang="ts">
const { data, error, refresh } = await useCatalog();
const search = ref(""),
  limit = ref(25);
const mainLevels = computed(
  () =>
    data.value?.levels
      .filter((l) => l.status === "main")
      .sort((a, b) => a.localRank! - b.localRank!) ?? [],
);
const levels = computed(() =>
  mainLevels.value.filter((l) =>
    l.name.toLowerCase().includes(search.value.toLowerCase().trim()),
  ),
);

const leaders = computed(() => data.value?.players.slice(0, 5) ?? []);
const districts = computed(
  () =>
    data.value?.districts.filter((d) => d.completionCount > 0).slice(0, 3) ??
    [],
);
const completionCounts = computed(() => {
  const counts: Record<number, number> = {};
  for (const record of data.value?.records ?? [])
    if (
      record.active &&
      Math.max(record.manualPercent ?? 0, record.importedPercent ?? 0) === 100
    )
      counts[record.levelId] = (counts[record.levelId] ?? 0) + 1;
  return counts;
});
watch(search, () => {
  limit.value = 25;
});
useHead({ title: "СПб Demonlist — демоны Санкт-Петербурга" });
</script>
<template>
  <section>
    <HomepageHighlights :levels="mainLevels" />
    <div class="content-grid">
      <div id="demonlist" class="list-column">
        <div class="list-tabs">
          <span class="tab selected"
            >Основной лист <b>{{ mainLevels.length }}</b></span
          ><NuxtLink to="/legacy" class="tab"
            >Legacy <AppIcon name="archive" :size="14"
          /></NuxtLink>
        </div>
        <div class="search-bar">
          <label class="search-field"
            ><span class="sr-only">Поиск уровня</span
            ><AppIcon name="search" :size="18" /><input
              v-model="search"
              type="search"
              placeholder="Найти уровень…" /></label
          ><span class="sort-label"
            >По сложности <AppIcon name="list" :size="15"
          /></span>
        </div>
        <div v-if="error" class="error" role="alert">
          Не удалось загрузить список.
          <button @click="refresh()">Повторить</button>
        </div>
        <LevelTable
          v-else
          :levels="levels.slice(0, limit)"
          :completion-counts="completionCounts"
        />
        <div v-if="levels.length" class="list-bottom">
          <span
            >Показано {{ Math.min(limit, levels.length) }} из
            {{ levels.length }}</span
          ><button v-if="limit < levels.length" @click="limit += 25">
            Показать ещё 25 <AppIcon name="plus" :size="15" />
          </button>
        </div>
      </div>
      <aside class="community" aria-label="Сообщество">
        <section class="rail-panel">
          <div class="rail-heading">
            <h2><AppIcon name="trophy" :size="18" /> Лидеры города</h2>
            <span>{{ data?.players.length ?? 0 }} игроков</span>
          </div>
          <ol class="leader-list">
            <li v-for="player in leaders" :key="player.id">
              <NuxtLink :to="`/players/${player.id}`"
                ><span
                  class="leader-rank"
                  :class="{ first: player.rank === 1 }"
                  >{{ player.rank }}</span
                ><UserAvatar :name="player.name" :url="player.avatar" /><span
                  class="leader-name"
                  >{{ player.name
                  }}<small>{{ player.top[0]?.name }}</small></span
                ><span class="leader-score">{{
                  player.score.toFixed(2)
                }}</span></NuxtLink
              >
            </li>
          </ol>
          <NuxtLink class="rail-link" to="/players"
            >Весь рейтинг <AppIcon name="chevron" :size="14"
          /></NuxtLink>
        </section>
        <section class="rail-panel district-panel">
          <div class="rail-heading">
            <h2><AppIcon name="map" :size="18" /> Районы в игре</h2>
          </div>
          <NuxtLink
            v-for="district in districts"
            :key="district.id"
            :to="`/districts/${district.id}`"
            class="district-line"
            ><span class="district-rank">{{ district.rank }}</span
            ><span
              >{{ district.name
              }}<small>{{
                district.region === "spb"
                  ? "Санкт-Петербург"
                  : "Ленинградская область"
              }}</small></span
            ><AppIcon name="chevron" :size="14" /></NuxtLink
          ><NuxtLink class="rail-link" to="/districts"
            >Все районы <AppIcon name="chevron" :size="14"
          /></NuxtLink>
        </section>
        <section class="sync-panel">
          <SourceStatus :sync="data?.sync ?? null" />
          <p>
            Позиции следуют Global Demonlist. В зачёте — прохождения нашего
            сообщества.
          </p>
          <NuxtLink to="/changelog"
            >Что изменилось <AppIcon name="history" :size="13"
          /></NuxtLink>
        </section>
        <NuxtLink to="/rules" class="rules-link"
          ><AppIcon name="book" /><span
            >Как работает рейтинг?<small
              >Хардесты, прогрессы и баллы</small
            ></span
          ><AppIcon name="chevron" :size="14"
        /></NuxtLink>
      </aside>
    </div>
  </section>
</template>
<style scoped lang="scss">
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 36px;
}
.list-column {
  min-width: 0;
  scroll-margin-top: 100px;
}
.list-tabs {
  display: flex;
  gap: 26px;
  border-bottom: 1px solid var(--line);
  height: 48px;
}
.tab {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--muted);
  padding-bottom: 17px;
  font-size: 16px;
}
.tab.selected {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
}
.tab b {
  font-size: 13px;
  font-weight: 400;
  border-radius: 4px;
  padding: 1px 6px;
  background: var(--accent-soft);
}
.search-bar {
  display: flex;
  gap: 14px;
  justify-content: space-between;
  align-items: center;
  margin: 18px 0;
}
.search-field {
  position: relative;
  flex: 1;
}
.search-field > svg {
  position: absolute;
  left: 13px;
  top: 13px;
  color: var(--muted);
}
.search-field input {
  padding-left: 40px;
  background: var(--surface);
  font-size: 15px;
}
.sort-label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  white-space: nowrap;
  color: var(--muted);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.list-bottom {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 22px 0;
}
.list-bottom > span {
  font-size: 14px;
  color: var(--muted);
}
.list-bottom button {
  font-size: 14px;
}
.community {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.rail-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.rail-heading {
  padding: 18px 17px 12px;
}
.rail-heading h2 {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  margin-bottom: 3px;
}
.rail-heading h2 svg {
  color: var(--accent);
}
.rail-heading > span {
  color: var(--muted);
  font-size: 13px;
  padding-left: 27px;
}
.leader-list {
  list-style: none;
  margin: 0;
  padding: 0 15px 8px;
}
.leader-list a {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 0;
}
.leader-rank {
  width: 12px;
  color: var(--muted);
  font-size: 14px;
}
.leader-rank.first {
  color: var(--warm);
}
.leader-list :deep(img) {
  height: 38px;
  width: 38px;
  border-radius: 9px;
}
.leader-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}
.leader-name small {
  font-size: 12px;
  color: var(--muted);
  display: block;
  font-weight: 400;
  margin-top: 3px;
}
.leader-score {
  font-size: 14px;
  color: var(--text);
}
.rail-link {
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  padding: 13px 18px;
  font-size: 14px;
}
.district-line {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 17px;
  font-size: 14px;
}
.district-line > span:nth-child(2) {
  flex: 1;
}
.district-line small {
  color: var(--muted);
  display: block;
  font-size: 12px;
  margin-top: 3px;
}
.district-rank {
  width: 25px;
  height: 27px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  border-radius: 6px;
  color: var(--accent);
}
.sync-panel {
  padding: 3px 5px;
}
.sync-panel p {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.8;
  margin: 12px 0;
}
.sync-panel > a {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--accent);
  font-size: 14px;
}
.rules-link {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--line);
  padding: 20px 4px;
  color: var(--text);
  font-size: 14px;
}
.rules-link > span {
  flex: 1;
}
.rules-link small {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
@media (max-width: 1050px) {
  .content-grid {
    grid-template-columns: minmax(0, 1fr) 270px;
    gap: 22px;
  }
  .sort-label {
    display: none;
  }
}
@media (max-width: 820px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
  .community {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .list-bottom {
    flex-wrap: wrap;
  }
}
@media (max-width: 540px) {
  .community {
    grid-template-columns: 1fr;
  }
  .list-tabs {
    gap: 22px;
  }
  .tab {
    font-size: 14px;
  }
  .list-bottom > span {
    font-size: 12px;
  }
}
</style>
