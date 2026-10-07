<script setup lang="ts">
import type { Permission } from "#shared/types/domain";
type Tier = "main" | "extended" | "legacy" | null;
interface HistoryEvent {
  id: number;
  createdAt: string;
  updatedAt: string | null;
  title?: string;
  note?: string;
  fromRank?: number | null;
  toRank?: number | null;
  fromTier?: string | null;
  toTier?: string | null;
}
const props = defineProps<{
  type: "changes" | "levels";
  event: HistoryEvent;
}>();
const emit = defineEmits<{ saved: [] }>();
const { data: account } = useNuxtData<{
  user: { headAdmin: boolean; permissions: Permission[] } | null;
}>("account");
const allowed = computed(
  () =>
    account.value?.user?.headAdmin ||
    account.value?.user?.permissions.includes("history:write"),
);
const editing = ref(false),
  deleting = ref(false),
  busy = ref(false),
  error = ref("");
const firstInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const dateTime = ref(""),
  title = ref(""),
  note = ref("");
const positions = reactive({
  fromRank: null as number | null,
  toRank: null as number | null,
  fromTier: null as Tier,
  toTier: null as Tier,
});
let version: string | null = null;
let initialDate = "";
let originalDate = "";
const tiers = [
  { value: null, label: "Вне листа" },
  { value: "main", label: "Main list" },
  { value: "extended", label: "Extended list" },
  { value: "legacy", label: "Legacy list" },
];

async function open() {
  version = props.event.updatedAt;
  originalDate = props.event.createdAt;
  initialDate = new Date(originalDate)
    .toLocaleString("sv-SE", { timeZone: "Europe/Moscow" })
    .replace(" ", "T")
    .slice(0, 16);
  dateTime.value = initialDate;
  title.value = props.event.title ?? "";
  note.value = props.event.note ?? "";
  Object.assign(positions, {
    fromRank: props.event.fromRank ?? null,
    toRank: props.event.toRank ?? null,
    fromTier: props.event.fromTier ?? null,
    toTier: props.event.toTier ?? null,
  });
  error.value = "";
  deleting.value = false;
  editing.value = true;
  await nextTick();
  firstInput.value?.focus();
}
function changeTier(side: "from" | "to") {
  const tier = positions[`${side}Tier`];
  const rank = positions[`${side}Rank`];
  positions[`${side}Rank`] =
    tier === "main"
      ? Math.max(1, Math.min(75, rank ?? 1))
      : tier === "extended"
        ? Math.max(76, Math.min(150, rank ?? 76))
        : null;
}
async function submit(remove = false) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const createdAt =
      remove || initialDate === dateTime.value
        ? originalDate
        : new Date(`${dateTime.value}+03:00`).toISOString();
    const body = remove
      ? { updatedAt: version }
      : {
          updatedAt: version,
          createdAt,
          ...(props.type === "changes"
            ? { title: title.value }
            : { note: note.value, ...positions }),
        };
    await $fetch(`/api/admin/history/${props.type}/${props.event.id}`, {
      method: remove ? "DELETE" : "PATCH",
      body,
    });
    editing.value = false;
    emit("saved");
  } catch (cause: any) {
    error.value =
      cause.data?.message ||
      "Не удалось сохранить событие. Проверьте поля и попробуйте ещё раз.";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div v-if="allowed" class="history-editor">
    <button v-if="!editing" type="button" class="edit-button" @click="open">
      Изменить событие
    </button>
    <form
      v-else
      class="history-form"
      :aria-busy="busy"
      @submit.prevent="submit()"
    >
      <label v-if="type === 'changes'"
        >Текст события<textarea
          ref="firstInput"
          v-model="title"
          required
          maxlength="6000"
          rows="5"
          :disabled="busy"
        />
      </label>
      <template v-else>
        <div class="positions">
          <fieldset
            v-for="side in ['from', 'to'] as const"
            :key="side"
            :disabled="busy"
          >
            <legend>{{ side === "from" ? "Было" : "Стало" }}</legend>
            <label
              >Раздел<select
                v-model="positions[`${side}Tier`]"
                @change="changeTier(side)"
              >
                <option
                  v-for="tier in tiers"
                  :key="tier.value ?? 'none'"
                  :value="tier.value"
                >
                  {{ tier.label }}
                </option>
              </select></label
            >
            <label
              v-if="
                positions[`${side}Tier`] === 'main' ||
                positions[`${side}Tier`] === 'extended'
              "
              >Позиция<input
                v-model.number="positions[`${side}Rank`]"
                type="number"
                :min="positions[`${side}Tier`] === 'main' ? 1 : 76"
                :max="positions[`${side}Tier`] === 'main' ? 75 : 150"
                step="1"
                required
            /></label>
          </fieldset>
        </div>
        <label
          >Примечание<textarea
            ref="firstInput"
            v-model="note"
            maxlength="2000"
            rows="3"
            :disabled="busy"
          />
        </label>
      </template>
      <label
        >Дата и время (Москва)<input
          v-model="dateTime"
          type="datetime-local"
          required
          :disabled="busy"
      /></label>
      <p class="muted">
        Сохранение изменит только это событие. Позиции в рейтинге останутся
        прежними.
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div v-if="deleting" class="delete-confirm" role="alert">
        <p>
          Удалить событие из
          {{ type === "changes" ? "общей истории" : "истории этого уровня" }}?
        </p>
        <p v-if="type === 'changes'">
          Все записи истории уровней, вызванные этим событием, будут удалены
          безвозвратно.
        </p>
        <div class="actions">
          <button
            type="button"
            class="danger"
            :disabled="busy"
            @click="submit(true)"
          >
            Удалить событие</button
          ><button type="button" :disabled="busy" @click="deleting = false">
            Оставить
          </button>
        </div>
      </div>
      <div v-else class="actions">
        <button type="submit" :disabled="busy">
          {{ busy ? "Сохраняем…" : "Сохранить" }}
        </button>
        <button type="button" :disabled="busy" @click="editing = false">
          Отменить изменения
        </button>
        <button
          type="button"
          class="danger"
          :disabled="busy"
          @click="deleting = true"
        >
          Удалить
        </button>
      </div>
    </form>
  </div>
</template>
<style scoped lang="scss">
.history-editor {
  margin-top: 10px;
  white-space: normal;
}
.edit-button {
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  text-align: left;
}
.history-form {
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: var(--radius);
  min-width: min(360px, 100%);
}
label {
  display: grid;
  gap: 7px;
  font-size: 14px;
  color: var(--text);
}
textarea,
input,
select {
  min-width: 0;
  width: 100%;
}
textarea {
  resize: vertical;
}
p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}
.positions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
fieldset {
  min-width: 0;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--line);
  display: grid;
  gap: 12px;
}
legend {
  color: var(--muted);
  font-size: 14px;
  padding: 0 5px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.danger {
  color: var(--danger);
}
.delete-confirm {
  display: grid;
  gap: 12px;
}
@media (max-width: 550px) {
  .positions {
    grid-template-columns: 1fr;
  }
  .history-form {
    padding: 14px;
  }
}
</style>
