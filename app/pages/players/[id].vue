<script setup lang="ts">
const route = useRoute(),
  id = Number(route.params.id);
const { data } = await useCatalog();
const player = computed(() => data.value?.players.find((p) => p.id === id));
if (!player.value)
  throw createError({ statusCode: 404, statusMessage: "Игрок не найден" });
const records = computed(
  () =>
    data.value?.records
      .filter((r) => r.playerId === id && r.active)
      .sort(
        (a, b) =>
          (data.value?.levels.find((l) => l.id === a.levelId)?.globalRank ??
            Infinity) -
          (data.value?.levels.find((l) => l.id === b.levelId)?.globalRank ??
            Infinity),
      ) ?? [],
);
const completions = computed(
  () =>
    records.value.filter(
      (r) => Math.max(r.manualPercent ?? 0, r.importedPercent ?? 0) === 100,
    ).length,
);
const progresses = computed(
  () =>
    records.value.filter((r) => {
      const percent = Math.max(r.manualPercent ?? 0, r.importedPercent ?? 0);
      return percent > 0 && percent < 100;
    }).length,
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
        <h1>{{ player.name }}</h1>
        <div class="district">
          <AppIcon name="map" /><NuxtLink
            v-if="player.districtId"
            :to="'/districts/' + player.districtId"
            >{{ player.districtName }}</NuxtLink
          ><span v-else>Район не назначен</span>
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
    <dl class="profile-stats">
      <div>
        <dt>Место в рейтинге</dt>
        <dd class="accent">#{{ player.rank }}</dd>
      </div>
      <div>
        <dt>Рейтинговый балл</dt>
        <dd>{{ player.score.toFixed(3) }}</dd>
      </div>
      <div>
        <dt>Прохождения</dt>
        <dd>{{ completions }}</dd>
      </div>
      <div>
        <dt>Прогрессы</dt>
        <dd>{{ progresses }}</dd>
      </div>
    </dl>
    <div class="section-heading">
      <h2>Шесть лучших результатов</h2>
      <span>Прохождения и прогрессы</span>
    </div>
    <RatingBreakdown :rating="player" />
    <div class="section-heading">
      <h2>
        Все достижения <span class="count">{{ records.length }}</span>
      </h2>
      <EntityEditButton
        resource="records"
        label="Добавить рекорд"
        :defaults="{ playerId: player.id }"
      />
    </div>
    <div class="records-panel panel">
      <RecordsTable
        :records="records"
        :players="data.players"
        :levels="data.levels"
      />
    </div>
    <RatingHistory :id="id" type="players" />
  </section>
</template>
<style scoped lang="scss">
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
