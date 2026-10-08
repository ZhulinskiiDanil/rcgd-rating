<script setup lang="ts">
import { hasLevelPage } from "#shared/utils/rating";
const emit = defineEmits<{ saved: [] }>();
const { data: catalog } = await useCatalog();
const open = ref(false),
  busy = ref(false),
  error = ref("");
const kind = ref("level"),
  entityId = ref<number | null>(null),
  search = ref(""),
  title = ref("");
const dateTime = ref("");
const labels: Record<string, string> = {
  level: "Уровень",
  "player-rating": "Игрок",
  "district-rating": "Район",
};
const entities = computed(() => {
  const rows =
    kind.value === "level"
      ? catalog.value?.levels.filter(hasLevelPage)
      : kind.value === "player-rating"
        ? catalog.value?.players
        : catalog.value?.districts.filter(
            (district) =>
              district.completionCount || district.legacyCompletionCount,
          );
  return (rows ?? [])
    .filter((row) =>
      row.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
});
watch(kind, () => {
  entityId.value = null;
  search.value = "";
});
function start() {
  dateTime.value = new Date()
    .toLocaleString("sv-SE", { timeZone: "Europe/Moscow" })
    .replace(" ", "T")
    .slice(0, 16);
  open.value = true;
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await $fetch("/api/admin/history", {
      method: "POST",
      body: {
        kind: kind.value,
        entityId: entityId.value,
        title: title.value,
        createdAt: new Date(`${dateTime.value}+03:00`).toISOString(),
      },
    });
    open.value = false;
    title.value = "";
    entityId.value = null;
    emit("saved");
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось добавить событие";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="event-creator">
    <button v-if="!open" type="button" @click="start">Добавить событие</button>
    <form v-else class="panel" @submit.prevent="save">
      <h2>Новое событие</h2>
      <fieldset :disabled="busy">
        <label
          >Тип события<select v-model="kind">
            <option
              v-for="(label, value) in labels"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select></label
        >
        <label
          >Найти
          {{
            kind === "level"
              ? "уровень"
              : kind === "player-rating"
                ? "игрока"
                : "район"
          }}<input
            v-model="search"
            type="search"
            placeholder="Название или ник"
        /></label>
        <label
          >Ссылка на страницу<select v-model="entityId">
            <option :value="null">Без ссылки</option>
            <option
              v-for="entity in entities"
              :key="entity.id"
              :value="entity.id"
            >
              {{ entity.name }} · ID {{ entity.id }}
            </option>
          </select></label
        >
        <label
          >Текст события<textarea
            v-model="title"
            required
            maxlength="6000"
            rows="4"
          />
        </label>
        <label
          >Дата и время (Москва)<input
            v-model="dateTime"
            type="datetime-local"
            required
        /></label>
      </fieldset>
      <p class="muted">
        Событие появится в общей истории. Позиции и достижения останутся
        прежними.
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="submit" :disabled="busy">
          {{ busy ? "Добавляем…" : "Добавить" }}</button
        ><button type="button" :disabled="busy" @click="open = false">
          Отмена
        </button>
      </div>
    </form>
  </div>
</template>
<style scoped lang="scss">
.event-creator {
  margin-bottom: 22px;
}
form {
  padding: 24px;
  max-width: 720px;
}
h2 {
  margin-top: 0;
  font-size: 22px;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 16px;
}
label {
  display: grid;
  gap: 8px;
}
input,
select,
textarea {
  min-width: 0;
  width: 100%;
}
textarea {
  resize: vertical;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
