<script setup lang="ts">
import { regionalFirstVictors } from "#shared/utils/victors";
const { data, error, refresh } = await useCatalog();
const mainLevels = computed(
  () =>
    data.value?.levels
      .filter((l) => l.status === "main")
      .sort((a, b) => a.localRank! - b.localRank!) ?? [],
);
const leaders = computed(() => data.value?.players.slice(0, 5) ?? []);
const victors = computed(() =>
  Object.fromEntries(
    mainLevels.value
      .slice(0, 3)
      .map((level) => [level.id, regionalFirstVictors(data.value!, level.id)]),
  ),
);
const districts = computed(
  () =>
    data.value?.districts.filter((d) => d.completionCount > 0).slice(0, 3) ??
    [],
);
useHead({ title: "СПб Demonlist — демоны Санкт-Петербурга" });
</script>
<template>
  <section>
    <div v-if="error" class="error" role="alert">
      Не удалось загрузить главную.
      <button @click="refresh()">Повторить</button>
    </div>
    <HomepageHighlights :levels="mainLevels" :victors="victors" />
    <div class="home-actions">
      <NuxtLink class="button primary" to="/demonlist"
        >Весь демонлист <AppIcon name="arrow" /></NuxtLink
      ><NuxtLink class="button" to="/forecast"
        >Рассчитать будущий рейтинг</NuxtLink
      >
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
                :class="{ inactive: player.inactive }"
                >{{ player.name }}<small>{{ player.top[0]?.name }}</small></span
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
          >Как работает рейтинг?<small>Хардесты, прогрессы и баллы</small></span
        ><AppIcon name="chevron" :size="14"
      /></NuxtLink>
    </aside>
  </section>
</template>
<style scoped lang="scss">
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

.leader-name.inactive {
  color: var(--danger);
}
.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 36px;
}
.community {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}
@media (max-width: 720px) {
  .community {
    grid-template-columns: 1fr;
  }
}
</style>
