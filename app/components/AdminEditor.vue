<script setup lang="ts">
import { permissionLabels, type Permission } from "#shared/types/domain";
import type { EntityResource, Field } from "~/types/admin";

const props = defineProps<{
  resource: EntityResource;
  fields: Field[];
  rows: Record<string, unknown>[];
  columns: { key: string; label: string }[];
  allowCreate?: boolean;
}>();
const emit = defineEmits<{ saved: [] }>();
const editorPanel = ref<HTMLDivElement | null>(null);
const selectedRow = ref<Record<string, unknown>>();
const editing = ref(false);
const formVersion = ref(0);
const formBusy = ref(false);
const isBusy = computed(() => formBusy.value);
const error = ref("");
const success = ref("");
const search = ref("");
const page = ref(1),
  deleted = ref(false);
const restorable = computed(() =>
  ["players", "levels", "records", "extras"].includes(props.resource),
);
const isDeleted = (row: Record<string, unknown>) =>
  !!row.deletedAt || (props.resource === "levels" && !!row.listExcluded);
async function restore(row: Record<string, unknown>) {
  try {
    await $fetch("/api/admin/restore", {
      method: "POST",
      body: { resource: props.resource, id: Number(row.id) },
    });
    await refreshNuxtData();
    saved();
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось восстановить";
  }
}
watch(
  () => props.resource,
  () => {
    editing.value = false;
    selectedRow.value = undefined;
    formBusy.value = false;
    error.value = "";
    success.value = "";
    search.value = "";
    page.value = 1;
    deleted.value = false;
  },
);
watch([search, deleted], () => {
  page.value = 1;
});
const filtered = computed(() =>
  props.rows.filter(
    (row) =>
      (!restorable.value || isDeleted(row) === deleted.value) &&
      props.columns.some((column) =>
        String(cellValue(row, column.key))
          .toLowerCase()
          .includes(search.value.trim().toLowerCase()),
      ),
  ),
);
const rows = computed(() =>
  filtered.value.slice((page.value - 1) * 30, page.value * 30),
);
watch(
  () => filtered.value.length,
  (total) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(total / 30)));
  },
);
function edit(row?: Record<string, unknown>) {
  if (isBusy.value) return;
  error.value = "";
  success.value = "";
  selectedRow.value = row;
  formVersion.value++;
  editing.value = true;
  nextTick(() => editorPanel.value?.scrollIntoView({ block: "nearest" }));
}
function saved() {
  editing.value = false;
  formBusy.value = false;
  success.value = "Сохранено";
  emit("saved");
}
function cellValue(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (key === "permissions" && row.headAdmin) return "Полный доступ";
  if (["active", "reviewNeeded", "headAdmin", "disabled"].includes(key))
    return value ? "Да" : "Нет";
  if (key === "status")
    return (
      (
        {
          main: "Main list",
          extended: "Extended list",
          legacy: "Legacy list",
          catalog: "Каталог",
        } as Record<string, string>
      )[String(value)] || value
    );
  if (key === "region")
    return value === "spb" ? "Санкт-Петербург" : "Ленинградская область";
  if (Array.isArray(value))
    return (
      value
        .map((item) => permissionLabels[item as Permission] || item)
        .join(", ") || "Только чтение"
    );
  return value ?? "—";
}
</script>
<template>
  <section class="editor">
    <div class="editor-toolbar">
      <label class="search-field"
        ><span class="sr-only">Поиск по записям</span
        ><AppIcon name="search" :size="18" /><input
          v-model="search"
          type="search"
          placeholder="Поиск по записям"
      /></label>
      <label v-if="restorable"
        ><input v-model="deleted" type="checkbox" /> Удалённые</label
      >
      <span class="record-count"
        >Найдено: <b>{{ filtered.length }}</b></span
      >
      <button
        v-if="allowCreate !== false"
        class="primary add-button"
        :disabled="isBusy"
        @click="edit()"
      >
        <AppIcon name="plus" :size="17" />Добавить
      </button>
    </div>
    <p v-if="error" class="error feedback" role="alert">{{ error }}</p>
    <p v-if="success" class="success feedback" role="status">
      <AppIcon name="check" :size="17" />{{ success }}
    </p>
    <div v-if="editing" ref="editorPanel" class="editor-panel">
      <EntityForm
        :key="formVersion"
        :resource="resource"
        :fields="fields"
        :row="selectedRow"
        @saved="saved"
        @cancel="editing = false"
        @busy="formBusy = $event"
      />
    </div>
    <div class="table-wrap panel">
      <table>
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" scope="col">{{ c.label }}</th>
            <th class="action-heading" scope="col">Действия</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="String(row.id)"
            :class="{ 'editing-row': editing && row.id === selectedRow?.id }"
          >
            <td
              v-for="c in columns"
              :key="c.key"
              :class="{
                'id-cell': c.key === 'id' || c.key.endsWith('Id'),
                'name-cell': [
                  'name',
                  'login',
                  'playerName',
                  'levelName',
                ].includes(c.key),
              }"
            >
              <span
                v-if="
                  ['active', 'reviewNeeded', 'headAdmin', 'disabled'].includes(
                    c.key,
                  )
                "
                :class="['boolean-value', { set: row[c.key] }]"
                >{{ cellValue(row, c.key) }}</span
              ><template v-else>{{ cellValue(row, c.key) }}</template>
            </td>
            <td class="action-cell">
              <div>
                <button
                  v-if="!isDeleted(row)"
                  :disabled="isBusy"
                  @click="edit(row)"
                >
                  Изменить</button
                ><EntityDeleteButton
                  v-if="
                    !isDeleted(row) &&
                    (resource === 'levels' ||
                      resource === 'records' ||
                      resource === 'extras' ||
                      resource === 'players')
                  "
                  :resource="resource"
                  :entity-id="Number(row.id)"
                  :disabled="isBusy"
                  @saved="saved"
                /><EntityDeleteButton
                  v-if="resource === 'records'"
                  resource="records"
                  :entity-id="Number(row.id)"
                  :disabled="isBusy"
                  permanent
                  label="Удалить навсегда"
                  @saved="saved"
                /><button
                  v-if="restorable && isDeleted(row)"
                  :disabled="isBusy"
                  @click="restore(row)"
                >
                  Восстановить
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 1" class="empty-table">
              <AppIcon name="search" :size="25" />
              <p>
                {{
                  search
                    ? "По этому запросу ничего не найдено"
                    : "Здесь пока нет записей"
                }}
              </p>
              <span>{{
                search
                  ? "Попробуй изменить запрос."
                  : allowCreate !== false
                    ? "Добавь первую запись с помощью кнопки выше."
                    : "Новые аккаунты появятся после регистрации."
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <span class="page-total"
        >{{ filtered.length ? (page - 1) * 30 + 1 : 0 }}–{{
          Math.min(page * 30, filtered.length)
        }}
        из {{ filtered.length }}</span
      >
      <div>
        <button
          aria-label="Предыдущая страница"
          :disabled="page <= 1"
          @click="page--"
        >
          <AppIcon class="previous" name="chevron" :size="16" /></button
        ><span
          >{{ page }}
          <small
            >/ {{ Math.max(1, Math.ceil(filtered.length / 30)) }}</small
          ></span
        ><button
          aria-label="Следующая страница"
          :disabled="page * 30 >= filtered.length"
          @click="page++"
        >
          <AppIcon name="chevron" :size="16" />
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped lang="scss">
.editor {
  min-width: 0;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}
.search-field {
  position: relative;
  flex: 0 1 340px;
  min-width: 180px;
  > svg {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    pointer-events: none;
  }
  input {
    padding-left: 40px;
    width: 100%;
    min-height: 42px;
    font-size: 14px;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.record-count {
  font-size: 14px;
  color: var(--muted);
  b {
    color: var(--text);
    font-weight: 500;
  }
}
.add-button {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.feedback {
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 15px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  &.success {
    display: flex;
    gap: 9px;
    align-items: center;
    color: var(--accent);
  }
}
.editor-panel {
  scroll-margin-top: 110px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  min-width: 720px;
  font-size: 14px;
}
th {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
td {
  max-width: 260px;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
th,
td {
  padding: 18px 20px;
}
.id-cell {
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
  color: var(--muted);
  width: 42px;
  font-variant-numeric: tabular-nums;
}
.name-cell {
  color: var(--text);
  font-weight: 500;
}
.editing-row {
  background: var(--accent-soft);
}
.boolean-value {
  color: var(--muted);
  font-size: 14px;
  &.set {
    color: var(--accent);
  }
}
.action-heading {
  text-align: right;
}
.action-cell {
  width: 1%;
  > div {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
  }
  button {
    white-space: nowrap;
    font-size: 14px;
    padding: 6px 10px;
    background: transparent;
    &:hover {
      background: var(--surface-raised);
    }
  }
  .delete-button {
    color: var(--danger);
  }
}
.empty-table {
  padding: 50px 20px;
  text-align: center;
  svg {
    color: var(--muted);
  }
  p {
    margin: 13px 0 5px;
    color: var(--text);
  }
  span {
    color: var(--muted);
    font-size: 14px;
  }
}
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  margin-top: 20px;
  .page-total {
    font-size: 14px;
    color: var(--muted);
  }
  > div {
    display: flex;
    align-items: center;
    gap: 15px;
    > span {
      font-size: 14px;
      font-variant-numeric: tabular-nums;
      small {
        color: var(--muted);
        font-size: inherit;
      }
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 33px;
      height: 33px;
      padding: 6px;
    }
  }
  .previous {
    transform: rotate(180deg);
  }
}
@media (max-width: 600px) {
  .editor-toolbar {
    gap: 12px;
  }
  .search-field {
    flex-basis: 100%;
  }
  .record-count {
    margin-right: auto;
  }
  .add-button {
    margin-left: 0;
  }
}
</style>
