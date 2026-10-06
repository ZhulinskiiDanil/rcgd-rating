<script setup lang="ts">
import type { ForecastEntity } from "#shared/utils/forecast";
const { data } = await useCatalog();
const route = useRoute();
const type = ref<ForecastEntity>(
  route.query.type === "districts" ? "districts" : "players",
);
const entityId = ref(Number(route.query.id) || 0);
const entities = computed(() => data.value?.[type.value] ?? []);
watch(type, () => (entityId.value = 0));
useHead({ title: "Будущий рейтинг · СПб Demonlist" });
</script>
<template>
  <section>
    <header class="page-heading">
      <div>
        <h1>Будущий рейтинг</h1>
        <p class="page-intro">
          Проверь, как запланированные достижения изменят место в рейтинге.
        </p>
      </div>
    </header>
    <div class="filters">
      <label
        >Рейтинг<select v-model="type">
          <option value="players">Игроки</option>
          <option value="districts">Районы</option>
        </select></label
      ><label
        >{{ type === "players" ? "Игрок" : "Район"
        }}<select v-model.number="entityId">
          <option :value="0">Выбери участника</option>
          <option
            v-for="entity in entities"
            :key="entity.id"
            :value="entity.id"
          >
            {{ entity.name }}
          </option>
        </select></label
      >
    </div>
    <ForecastCalculator
      v-if="entityId && entities.some((e) => e.id === entityId)"
      :entity-type="type"
      :entity-id="entityId"
    />
    <p v-else class="muted">
      Выбери игрока или район, чтобы составить сценарий.
    </p>
  </section>
</template>
<style scoped lang="scss">
.filters label:last-child {
  min-width: 240px;
}
</style>
