<script setup lang="ts">
import { effectivePercent } from "#shared/utils/rating";
import { regionalFirstVictors } from "#shared/utils/victors";
const { data, error, refresh } = await useCatalog();
const { data: session } = await useAccount();
const route = useRoute();
const search = ref("");
const completion = ref("all");
const tier = computed(() =>
  ["extended", "legacy"].includes(String(route.query.list))
    ? String(route.query.list)
    : "main",
);
const tabs = [
  { key: "main", label: "Main list", range: "1–75" },
  { key: "extended", label: "Extended list", range: "76–150" },
  { key: "legacy", label: "Legacy list", range: "Вылетевшие уровни" },
];
const player = computed(() =>
  data.value?.players.find((p) => p.accountId === session.value?.user?.id),
);
const completed = computed(
  () =>
    new Set(
      data.value?.records
        .filter(
          (r) =>
            r.playerId === player.value?.id &&
            effectivePercent({ ...r, note: "" }) === 100,
        )
        .map((r) => r.levelId),
    ),
);
const victors = computed(() =>
  Object.fromEntries(
    (data.value?.levels ?? [])
      .filter((l) => l.status === tier.value)
      .map((l) => [
        l.id,
        regionalFirstVictors(data.value!, l.id).filter((r) => r.hasCompletions),
      ]),
  ),
);
const first = computed(
  () =>
    new Set(
      Object.entries(victors.value)
        .filter(([, rows]) =>
          rows.some((r) =>
            r.victors.some((v) => v.playerId === player.value?.id),
          ),
        )
        .map(([id]) => Number(id)),
    ),
);
const levels = computed(() =>
  (data.value?.levels ?? [])
    .filter(
      (l) =>
        l.status === tier.value &&
        l.name.toLowerCase().includes(search.value.toLowerCase().trim()) &&
        (completion.value === "all" ||
          completed.value.has(l.id) === (completion.value === "completed")),
    )
    .sort((a, b) =>
      tier.value === "legacy"
        ? (b.exitedAt ?? "").localeCompare(a.exitedAt ?? "")
        : a.localRank! - b.localRank!,
    ),
);
useHead({ title: "Демонлист · СПб Demonlist" });
</script>
<template>
  <section>
    <header class="page-heading">
      <div>
        <h1>Демонлист</h1>
        <p class="page-intro">
          150 сложнейших уровней, пройденных в Санкт-Петербурге и Ленинградской
          области.
        </p>
      </div>
      <EntityEditButton resource="levels" label="Добавить уровень" />
    </header>
    <nav class="list-tabs" aria-label="Разделы демонлиста">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.key"
        :to="{
          path: '/demonlist',
          query: tab.key === 'main' ? {} : { list: tab.key },
        }"
        :class="{ selected: tier === tab.key }"
        :aria-current="tier === tab.key ? 'page' : undefined"
        ><strong>{{ tab.label }}</strong
        ><span>{{ tab.range }}</span></NuxtLink
      >
    </nav>
    <div class="filters">
      <label class="search"
        >Поиск уровня<input
          v-model="search"
          type="search"
          placeholder="Название уровня" /></label
      ><label v-if="player"
        >Мои прохождения<select v-model="completion">
          <option value="all">Все уровни</option>
          <option value="completed">Пройденные</option>
          <option value="remaining">Непройденные</option>
        </select></label
      ><span class="muted">{{ levels.length }} уровней</span>
    </div>
    <p v-if="tier === 'legacy'" class="page-intro">
      Уровни, вылетевшие из местного топа-150 после запуска листа. Новые рекорды
      здесь больше не принимаются.
    </p>
    <p v-if="player" class="legend">
      <span>Зелёная рамка — пройден</span
      ><span>Жёлтая — первый виктор в городе или области</span>
    </p>
    <div v-if="error" class="error" role="alert">
      Не удалось загрузить лист. <button @click="refresh()">Повторить</button>
    </div>
    <LevelTable
      v-else
      :levels="levels"
      :legacy="tier === 'legacy'"
      :victors="victors"
      :completed="completed"
      :first="first"
    />
  </section>
</template>
<style scoped lang="scss">
.list-tabs {
  display: flex;
  gap: 32px;
  border-bottom: 1px solid var(--line);
  a {
    display: grid;
    gap: 3px;
    padding: 12px 0 16px;
    border-bottom: 3px solid transparent;
    span {
      font-size: 12px;
      color: var(--muted);
    }
    &.selected {
      border-color: var(--accent);
      color: var(--accent);
    }
  }
}
.search {
  flex: 1;
  max-width: 540px;
  min-width: 180px;
}
.legend {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted);
  span::before {
    content: "";
    display: inline-block;
    width: 9px;
    height: 9px;
    border: 2px solid var(--success);
    border-radius: 3px;
    margin-right: 7px;
  }
  span:last-child::before {
    border-color: var(--warm);
  }
}
@media (max-width: 540px) {
  .list-tabs {
    gap: 18px;
    a strong {
      font-size: 14px;
    }
    a span {
      font-size: 10px;
    }
  }
}
</style>
