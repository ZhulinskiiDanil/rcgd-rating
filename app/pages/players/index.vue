<script setup lang="ts">
import { hasLevelPage, rankEntries } from "#shared/utils/rating";
import { formatPosition, formatScore } from "#shared/utils/presentation";
const { data, error } = await useCatalog();
const search = ref(""),
  district = ref(""),
  region = ref("");
const districts = computed(
  () =>
    data.value?.districts.filter(
      (d) => !region.value || d.region === region.value,
    ) ?? [],
);
watch(region, () => {
  district.value = "";
});
const filteredPlayers = computed(
  () =>
    data.value?.players.filter(
      (p) =>
        !p.hidden &&
        !p.deletedAt &&
        p.name.toLowerCase().includes(search.value.trim().toLowerCase()) &&
        (!district.value || p.districtId === Number(district.value)) &&
        (!region.value || districts.value.some((d) => d.id === p.districtId)),
    ) ?? [],
);
const hasFilters = computed(
  () => !!(search.value.trim() || district.value || region.value),
);
const players = computed(() =>
  hasFilters.value ? rankEntries(filteredPlayers.value) : filteredPlayers.value,
);
const linkedLevels = computed(
  () =>
    new Set(
      data.value?.levels.filter(hasLevelPage).map((level) => level.id) ?? [],
    ),
);
const linkedDistricts = computed(
  () =>
    new Set(
      data.value?.districts
        .filter(
          (district) =>
            district.completionCount + district.legacyCompletionCount > 0,
        )
        .map((district) => district.id) ?? [],
    ),
);
const districtNames = computed(
  () =>
    new Map(
      data.value?.districts.map((item) => [
        item.id,
        item.name + (item.region === "lo" ? " (ЛО)" : ""),
      ]) ?? [],
    ),
);
const resetFilters = () => {
  search.value = "";
  region.value = "";
  district.value = "";
};
useHead({ title: "Рейтинг игроков · СПб Demonlist" });
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <h1>Рейтинг игроков</h1>
        <p class="page-intro">
          Шесть результатов, которые определяют место в топе.
        </p>
      </div>
      <NuxtLink class="calculation-link" to="/rules"
        ><AppIcon name="book" /> Как считается рейтинг</NuxtLink
      >
      <EntityEditButton resource="players" label="Добавить игрока" />
    </div>
    <nav class="ranking-tabs" aria-label="Вид рейтинга">
      <NuxtLink to="/players" aria-current="page"
        ><AppIcon name="users" /> Игроки
        <span>{{
          data?.players.filter((player) => !player.hidden && !player.deletedAt)
            .length ?? 0
        }}</span></NuxtLink
      >
      <NuxtLink to="/districts"><AppIcon name="map" /> Районы</NuxtLink>
    </nav>
    <div class="leaderboard panel">
      <div class="filters">
        <label class="search-filter"
          ><span>Поиск игрока</span>
          <span class="search-input">
            <AppIcon name="search" /><input
              v-model="search"
              type="search"
              placeholder="Никнейм игрока" /></span
        ></label>
        <label
          >Территория<select v-model="region">
            <option value="">СПб и область</option>
            <option value="spb">Санкт-Петербург</option>
            <option value="lo">Ленинградская область</option>
          </select></label
        >
        <label
          >Район<select v-model="district">
            <option value="">Все районы</option>
            <option v-for="d in districts" :key="d.id" :value="d.id">
              {{ d.name }} · {{ d.region === "spb" ? "СПб" : "ЛО" }}
            </option>
          </select></label
        >
      </div>
      <div class="table-note">
        <span
          >Игроков: <strong>{{ players.length }}</strong></span
        ><span>Меньше балл — выше место</span>
      </div>
      <p v-if="error" class="error load-error">
        Не удалось загрузить рейтинг. Обновите страницу.
      </p>
      <div v-else-if="players.length" class="table-wrap" tabindex="0">
        <table
          :aria-label="
            hasFilters ? 'Рейтинг игроков с учётом фильтров' : 'Рейтинг игроков'
          "
        >
          <thead>
            <tr>
              <th scope="col" class="place-col">Место</th>
              <th scope="col">Игрок</th>
              <th scope="col">Район</th>
              <th scope="col" class="score-col">Балл</th>
              <th scope="col">Лучший результат</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in players"
              :key="p.id"
              :class="{
                podium: p.rank !== null && p.rank <= 3,
                'inactive-player': p.inactive,
              }"
            >
              <td>
                <span class="rank" :class="'rank-' + p.rank">{{ p.rank }}</span>
              </td>
              <td>
                <div class="entity-name">
                  <NuxtLink class="player-link" :to="'/players/' + p.id"
                    ><UserAvatar :name="p.name" :url="p.avatar" /><span>{{
                      p.name
                    }}</span></NuxtLink
                  >
                  <span v-if="p.role" class="role-label">{{
                    p.role === "head-admin"
                      ? "Главный администратор"
                      : "Администратор"
                  }}</span>
                  <EntityEditButton
                    resource="players"
                    :entity-id="p.id"
                    :label="`Редактировать игрока ${p.name}`"
                    compact
                  />
                </div>
              </td>
              <td>
                <NuxtLink
                  v-if="p.districtId && linkedDistricts.has(p.districtId)"
                  class="district-link"
                  :to="'/districts/' + p.districtId"
                  >{{ districtNames.get(p.districtId) }}</NuxtLink
                ><span v-else class="unassigned">{{
                  districtNames.get(p.districtId ?? 0) || "Не назначен"
                }}</span>
              </td>
              <td class="score">{{ formatScore(p.score) }}</td>
              <td>
                <div v-if="p.top[0]?.levelId" class="best-result">
                  <NuxtLink
                    v-if="linkedLevels.has(p.top[0].levelId)"
                    :to="'/levels/' + p.top[0].levelId"
                    >{{ p.top[0].name }}</NuxtLink
                  ><span v-else>{{ p.top[0].name }}</span
                  ><span :class="{ progress: p.top[0].kind === 'progress' }"
                    >{{ formatPosition(p.top[0].percent) }}%</span
                  >
                </div>
                <span v-else class="unassigned">Нет результата</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">
        <AppIcon name="users" />
        <h2>
          {{
            search || district || region
              ? "Игроки не найдены"
              : "Рейтинг пока пуст"
          }}
        </h2>
        <p>
          {{
            search || district || region
              ? "Попробуйте другой никнейм или измените фильтры."
              : "Игроки появятся здесь после добавления."
          }}
        </p>
        <button
          v-if="search || district || region"
          type="button"
          @click="resetFilters"
        >
          Сбросить фильтры
        </button>
      </div>
    </div>
    <p class="ranking-footnote">
      В рейтинг входят прохождения и подходящие прогрессы. При включённых
      фильтрах места пересчитываются среди выбранных игроков.
    </p>
  </section>
</template>
<style scoped lang="scss">
.inactive-player .player-link {
  color: var(--danger);
}
.role-label {
  font-size: 12px;
  color: var(--muted);
}
.entity-name {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.calculation-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  white-space: nowrap;
}
.ranking-tabs {
  display: flex;
  gap: 28px;
  margin-top: 30px;
  border-bottom: 1px solid var(--line);
  a {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 15px 1px;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-weight: 600;
    text-decoration: none;
  }
  a[aria-current] {
    border-color: var(--accent);
    color: var(--text);
  }
  span {
    padding: 2px 7px;
    border-radius: 5px;
    background: var(--surface-raised);
    font-size: 14px;
    color: var(--accent);
  }
}
.leaderboard {
  margin-top: 22px;
  overflow: hidden;
  .table-wrap {
    border: 0;
    border-radius: 0;
  }
}
.filters {
  margin: 0;
  padding: 22px 24px 18px;
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) 1fr 1fr;
  gap: 16px;
  label {
    color: var(--muted);
    font-size: 14px;
    gap: 8px;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    font-size: 16px;
  }
}
.search-input {
  position: relative;
  display: flex;
  align-items: center;
  :deep(svg) {
    position: absolute;
    left: 12px;
    pointer-events: none;
    width: 17px;
  }
  input {
    padding-left: 38px;
  }
}
.table-note {
  padding: 0 24px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 14px;
  strong {
    color: var(--text);
    font-weight: 500;
  }
}
table {
  min-width: 740px;
  font-size: 15px;
  th {
    font-size: 14px;
    font-weight: 500;
    color: var(--muted);
  }
  th,
  td {
    padding: 22px 18px;
  }
  th:first-child,
  td:first-child {
    padding-left: 24px;
    width: 76px;
  }
  th:last-child,
  td:last-child {
    padding-right: 24px;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
}
.rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.rank-1 {
  color: var(--warm);
  background: color-mix(in srgb, var(--warm), transparent 90%);
  border: 1px solid color-mix(in srgb, var(--warm), transparent 65%);
}
.rank-2 {
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--line);
}
.rank-3 {
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent), transparent 70%);
}
.player-link {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
  width: fit-content;
  &:hover {
    color: var(--accent);
  }
}
.district-link {
  color: var(--muted);
  font-size: 14px;
  text-decoration: none;
  &:hover {
    color: var(--accent);
  }
}
.unassigned {
  color: var(--muted);
  font-size: 14px;
}
.score,
.score-col {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.score {
  font-weight: 600;
  color: var(--text);
}
.best-result {
  display: flex;
  align-items: center;
  gap: 9px;
  a {
    color: var(--text);
    text-decoration: none;
    &:hover {
      color: var(--accent);
    }
  }
  span {
    color: var(--accent);
    font-size: 14px;
    white-space: nowrap;
  }
  span.progress {
    color: var(--warm);
  }
}
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--muted);
  :deep(svg) {
    width: 30px;
    height: 30px;
  }
  h2 {
    color: var(--text);
    font-size: 18px;
    margin-top: 16px;
  }
  p {
    font-size: 14px;
  }
}
.load-error {
  padding: 24px;
}
.ranking-footnote {
  margin-top: 18px;
  color: var(--muted);
  font-size: 14px;
  max-width: 74ch;
}
@media (max-width: 800px) {
  .filters {
    grid-template-columns: 1fr 1fr;
    .search-filter {
      grid-column: 1 / -1;
    }
  }
}
@media (max-width: 480px) {
  .filters {
    grid-template-columns: 1fr;
    padding: 18px 16px;
  }
  .table-note {
    padding: 0 16px 18px;
    flex-wrap: wrap;
  }
  .ranking-tabs {
    margin-top: 20px;
  }
}
@media (max-width: 600px) {
  table {
    min-width: 0;
    table-layout: fixed;
    th,
    td {
      padding: 13px 10px;
    }
    th:first-child,
    td:first-child {
      width: 54px;
      padding-left: 12px;
      padding-right: 6px;
    }
    th:nth-child(3),
    td:nth-child(3),
    th:nth-child(5),
    td:nth-child(5) {
      display: none;
    }
    th:nth-child(4),
    td:nth-child(4) {
      width: 83px;
      padding-right: 16px;
      padding-left: 8px;
    }
  }
  .player-link {
    max-width: 100%;
    gap: 9px;
    font-size: 14px;
    :deep(img) {
      width: 30px;
      height: 30px;
      border-radius: 8px;
    }
    span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }
  .rank {
    width: 29px;
    height: 31px;
    font-size: 14px;
  }
  .score {
    font-size: 14px;
  }
}
</style>
