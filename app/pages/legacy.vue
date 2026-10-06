<script setup lang="ts">
const { data, error, refresh } = await useCatalog();
const search = ref("");
const allLegacy = computed(
  () => data.value?.levels.filter((l) => l.status === "legacy") ?? [],
);
const levels = computed(() =>
  allLegacy.value
    .filter((l) =>
      l.name.toLowerCase().includes(search.value.trim().toLowerCase()),
    )
    .sort((a, b) => (a.localRank ?? Infinity) - (b.localRank ?? Infinity)),
);
useHead({ title: "Legacy-лист · СПб Demonlist" });
</script>
<template>
  <section class="legacy-page">
    <header class="page-heading">
      <div>
        <h1>Legacy-лист</h1>
        <p class="page-intro">
          Новые вылеты из основного списка Петербурга и области.
        </p>
      </div>
      <NuxtLink to="/" class="back-link"
        ><AppIcon name="list" />Основной лист</NuxtLink
      >
    </header>
    <div class="archive-banner">
      <div class="archive-symbol"><AppIcon name="archive" /></div>
      <div>
        <h2>За пределами топа-150</h2>
        <p>
          Сюда попадают новые вылетевшие из основного СПб-листа уровни.
          Прохождения и персональные рекорды сохраняются.
        </p>
      </div>
      <div class="archive-total">
        <strong>{{ allLegacy.length }}</strong
        ><span>уровней в архиве</span>
      </div>
    </div>
    <div class="filters archive-filters">
      <label class="search-field"
        ><AppIcon name="search" /><input
          v-model="search"
          type="search"
          aria-label="Поиск уровня в Legacy"
          placeholder="Найти уровень в архиве" /></label
      ><span>{{ levels.length }} из {{ allLegacy.length }}</span>
    </div>
    <p v-if="error" class="error">
      Не удалось загрузить архив. <button @click="refresh()">Повторить</button>
    </p>
    <LevelTable v-if="allLegacy.length" :levels="levels" legacy />
    <div v-else-if="!error" class="empty-state panel">
      <AppIcon name="archive" :size="32" />
      <h2>Новых вылетов пока нет</h2>
      <p>
        Когда уровень покинет основной топ-150, он появится здесь с датой
        вылета.
      </p>
    </div>
    <p class="archive-note">
      <AppIcon name="clock" />Дата вылета — день, когда сайт обнаружил
      изменение. Даты до первого импорта не восстанавливаются.
    </p>
  </section>
</template>
<style scoped lang="scss">
.page-heading h1 {
  margin-bottom: 12px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  white-space: nowrap;
}
.archive-banner {
  display: flex;
  align-items: center;
  gap: 22px;
  border-block: 1px solid var(--line);
  padding: 30px 0;
  margin-top: 26px;
  h2 {
    font-size: 24px;
    margin: 0 0 10px;
  }
  p {
    font-size: 15px;
    color: var(--muted);
    max-width: 540px;
    line-height: 1.7;
    margin: 0;
  }
}
.archive-symbol {
  color: var(--warm);
  display: grid;
  place-items: center;
  width: 66px;
  height: 66px;
  background: color-mix(in srgb, var(--warm), transparent 93%);
  border-radius: 16px;
  flex-shrink: 0;
  svg {
    width: 30px;
    height: 30px;
  }
}
.archive-total {
  display: flex;
  flex-direction: column;
  margin-left: auto;
  padding-left: 25px;
  border-left: 1px solid var(--line);
  flex-shrink: 0;
  strong {
    font-size: 44px;
    font-family: "Unbounded", sans-serif;
    font-weight: 500;
  }
  span {
    font-size: 14px;
    color: var(--muted);
    margin-top: 5px;
  }
}
.archive-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 25px 0;
  > span {
    font-size: 14px;
    color: var(--muted);
  }
}
.search-field {
  position: relative;
  width: min(100%, 380px);
  svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    width: 17px;
    height: 17px;
    color: var(--muted);
  }
  input {
    padding-left: 42px;
    width: 100%;
  }
}
.archive-note {
  display: flex;
  gap: 8px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.7;
  margin-top: 20px;
  svg {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    margin-top: 2px;
  }
}
@media (max-width: 650px) {
  .archive-banner {
    flex-wrap: wrap;
    gap: 15px;
    padding: 25px 0;
    > div:nth-child(2) {
      flex: 1;
    }
  }
  .archive-total {
    margin-left: 81px;
    border: none;
    padding: 0;
    strong {
      font-size: 24px;
    }
  }
  .archive-symbol {
    width: 56px;
    height: 56px;
  }
  .archive-filters {
    gap: 12px;
  }
  .back-link {
    margin-top: 8px;
  }
}
</style>
