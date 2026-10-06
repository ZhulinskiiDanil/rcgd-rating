<script setup lang="ts">
import { rankEntries } from "#shared/utils/rating";
import { formatScore } from "#shared/utils/presentation";
const { data, error } = await useCatalog();
const region = ref("");
const filteredDistricts = computed(
  () =>
    data.value?.districts.filter(
      (d) => !region.value || d.region === region.value,
    ) ?? [],
);
const districts = computed(() =>
  region.value
    ? [
        ...rankEntries(
          filteredDistricts.value.filter(
            (district) => district.completionCount > 0,
          ),
        ),
        ...filteredDistricts.value.filter(
          (district) => !district.completionCount,
        ),
      ]
    : filteredDistricts.value,
);
useHead({ title: "Рейтинг районов · СПб Demonlist" });
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <h1>Рейтинг районов</h1>
        <p class="page-intro">
          Сильнейшие прохождения Санкт-Петербурга и области — по районам.
        </p>
      </div>
      <NuxtLink class="calculation-link" to="/rules"
        ><AppIcon name="book" /> Как считается рейтинг</NuxtLink
      >
      <EntityEditButton resource="districts" label="Добавить район" />
    </div>
    <nav class="ranking-tabs" aria-label="Вид рейтинга">
      <NuxtLink to="/players"><AppIcon name="users" /> Игроки</NuxtLink
      ><NuxtLink to="/districts" aria-current="page"
        ><AppIcon name="map" /> Районы
        <span>{{ data?.districts.length ?? 0 }}</span></NuxtLink
      >
    </nav>
    <div class="regional-note">
      <AppIcon name="map" />
      <p>
        В зачёте —
        <strong>шесть сложнейших уникальных прохождений</strong> жителей района.
        Каждый уровень учитывается один раз, прогрессы не входят в рейтинг.
      </p>
    </div>
    <DistrictMap v-if="data" :districts="data.districts" />
    <div class="leaderboard panel">
      <div class="filters">
        <label
          >Территория<select v-model="region">
            <option value="">СПб и область</option>
            <option value="spb">Санкт-Петербург</option>
            <option value="lo">Ленинградская область</option>
          </select></label
        ><span class="filter-note"
          >Районов: <strong>{{ districts.length }}</strong></span
        >
      </div>
      <p v-if="error" class="error load-error">
        Не удалось загрузить рейтинг. Обновите страницу.
      </p>
      <div v-else-if="districts.length" class="table-wrap" tabindex="0">
        <table
          :aria-label="
            region ? 'Рейтинг районов с учётом фильтра' : 'Рейтинг районов'
          "
        >
          <thead>
            <tr>
              <th scope="col">Место</th>
              <th scope="col">Район</th>
              <th scope="col">Территория</th>
              <th scope="col" class="number-col">Игроков</th>
              <th scope="col" class="number-col">Пройденных уровней</th>
              <th scope="col" class="number-col">Балл</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in districts" :key="d.id">
              <td>
                <span
                  v-if="d.rank !== null"
                  class="rank"
                  :class="'rank-' + d.rank"
                  >{{ d.rank }}</span
                >
              </td>
              <td>
                <div class="entity-name">
                  <NuxtLink
                    v-if="d.completionCount + d.legacyCompletionCount > 0"
                    class="district-link"
                    :to="'/districts/' + d.id"
                    >{{ d.name }}<AppIcon name="chevron" /></NuxtLink
                  ><span v-else class="district-name">{{ d.name }}</span
                  ><EntityEditButton
                    resource="districts"
                    :entity-id="d.id"
                    :label="`Редактировать район ${d.name}`"
                    compact
                  />
                  <EntityEditButton
                    resource="extras"
                    :defaults="{ districtId: d.id }"
                    :label="`Добавить прохождение в район ${d.name}`"
                    compact
                  />
                </div>
              </td>
              <td>
                <span
                  class="region-label"
                  :class="{ oblast: d.region === 'lo' }"
                  >{{
                    d.region === "spb"
                      ? "Санкт-Петербург"
                      : "Ленинградская область"
                  }}</span
                >
              </td>
              <td class="number-col muted">{{ d.playerCount }}</td>
              <td class="number-col muted">{{ d.completionCount }}</td>
              <td class="number-col score">
                <span v-if="d.completionCount">{{ formatScore(d.score) }}</span
                ><span v-else class="empty-rating">{{
                  d.legacyCompletionCount
                    ? "Нет прохождений в топ-150"
                    : "Нет прохождений"
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">
        <AppIcon name="map" />
        <h2>
          {{
            region ? "В этой территории районов пока нет" : "Районов пока нет"
          }}
        </h2>
        <p>
          {{
            region
              ? "Выберите другую территорию или откройте общий рейтинг."
              : "Добавленные районы появятся в рейтинге."
          }}
        </p>
        <button v-if="region" type="button" @click="region = ''">
          Все районы
        </button>
      </div>
    </div>
    <p class="ranking-footnote">
      Меньше балл — выше место. Прохождения, добавленные отдельно, учитываются
      по тем же правилам. Фильтр пересчитывает места среди выбранных районов.
    </p>
  </section>
</template>
<style scoped lang="scss">
.district-name {
  font-weight: 500;
}
.empty-rating {
  color: var(--muted);
  font-size: 14px;
  font-weight: 400;
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
.regional-note {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  margin: 24px 0;
  color: var(--muted);
  font-size: 15px;
  max-width: 76ch;
  :deep(svg) {
    color: var(--accent);
    margin-top: 3px;
    flex-shrink: 0;
  }
  p {
    margin: 0;
  }
  strong {
    color: var(--text);
    font-weight: 500;
  }
}
.leaderboard {
  overflow: hidden;
  .table-wrap {
    border: 0;
    border-radius: 0;
  }
}
.filters {
  margin: 0;
  padding: 20px 24px;
  justify-content: space-between;
  label {
    min-width: 230px;
    gap: 8px;
    font-size: 14px;
    color: var(--muted);
  }
  select {
    font-size: 15px;
  }
}
.filter-note {
  color: var(--muted);
  font-size: 14px;
  strong {
    color: var(--text);
    font-weight: 500;
  }
}
table {
  min-width: 720px;
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
.district-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  font-weight: 500;
  text-decoration: none;
  :deep(svg) {
    width: 13px;
    opacity: 0.3;
  }
  &:hover {
    color: var(--accent);
    :deep(svg) {
      opacity: 1;
    }
  }
}
.region-label {
  font-size: 14px;
  color: var(--accent);
  border: 1px solid var(--line);
  padding: 4px 8px;
  border-radius: 5px;
  display: inline-block;
  max-width: 240px;
  &.oblast {
    color: var(--accent);
    border-color: var(--line);
  }
}
.number-col {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.score {
  font-weight: 600;
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
@media (max-width: 480px) {
  .ranking-tabs {
    margin-top: 20px;
  }
  .filters {
    padding: 18px 16px;
    label {
      width: 100%;
      min-width: 0;
    }
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
    th:nth-child(4),
    td:nth-child(4),
    th:nth-child(5),
    td:nth-child(5) {
      display: none;
    }
    th:last-child,
    td:last-child {
      width: 83px;
      padding-right: 16px;
      padding-left: 8px;
    }
  }
  .district-link {
    font-size: 14px;
    overflow-wrap: anywhere;
    :deep(svg) {
      display: none;
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
