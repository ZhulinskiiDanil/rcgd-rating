<script setup lang="ts">
import type { EntityResource, Field } from "~/types/admin";
import { recordVideoUrl } from "#shared/utils/record-video";

const props = defineProps<{
  resource: EntityResource;
  fields: Field[];
  row?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  title?: string;
  embedded?: boolean;
}>();
const emit = defineEmits<{
  saved: [];
  cancel: [];
  busy: [value: boolean];
  dirty: [value: boolean];
}>();
const formId = `entity-${useId()}`;
const formElement = ref<HTMLFormElement | null>(null);
const errorSummary = ref<HTMLParagraphElement | null>(null);
const form = ref<Record<string, any>>({});
const initialSnapshot = ref("");
const busy = ref(false);
const error = ref("");
const imageUploads = ref(new Set<string>());
const dateBusy = ref(false);
const dateMessage = ref("");
const dateError = ref(false);
const passwordBusy = ref(false);
let dateRequest: AbortController | undefined;
let dateTimer: ReturnType<typeof setTimeout> | undefined;
let dateVersion = 0;
const isBusy = computed(
  () => busy.value || passwordBusy.value || imageUploads.value.size > 0,
);
const visibleFields = computed(() =>
  props.fields.filter(
    (field) =>
      !field.visibleWhen ||
      field.visibleWhen.values.some(
        (value) => String(value) === String(form.value[field.visibleWhen!.key]),
      ),
  ),
);
const isDirty = computed(
  () => JSON.stringify(form.value) !== initialSnapshot.value,
);
function isGlobalField(field: Field) {
  return (
    props.resource === "levels" &&
    !!props.row?.gdlId &&
    ["name", "creator", "ingameId", "manualPosition"].includes(field.key)
  );
}

function initialize() {
  cancelDateLookup();
  dateMessage.value = "";
  dateError.value = false;
  const values: Record<string, any> = {};
  if (props.row?.id) values.id = props.row.id;
  for (const field of props.fields) {
    let value = props.row
      ? (props.row[field.key] ?? field.default)
      : (props.defaults?.[field.key] ?? field.default);
    if (field.key === "thresholdSource" && value && value !== "manual")
      value = "coreboard";
    if (field.type === "date" && typeof value === "string")
      value = value.slice(0, 10);
    values[field.key] =
      field.type === "checkbox"
        ? !!value
        : field.type === "permissions"
          ? Array.isArray(value)
            ? [...value]
            : []
          : (value ?? "");
  }
  if (props.resource === "records") {
    values.dateSource =
      props.row?.dateSource ?? (values.achievedAt ? "manual" : null);
    values.sourceVideo = props.row?.sourceVideo ?? "";
  }
  form.value = values;
  initialSnapshot.value = JSON.stringify(values);
  error.value = "";
}
watch(() => [props.resource, props.row?.id], initialize, { immediate: true });
watch(isBusy, (value) => emit("busy", value), {
  immediate: true,
  flush: "sync",
});
watch(isDirty, (value) => emit("dirty", value), {
  immediate: true,
  flush: "sync",
});

function imageBusy(key: string, uploading: boolean) {
  if (uploading) imageUploads.value.add(key);
  else imageUploads.value.delete(key);
}
const recordVideo = computed(() => {
  if (props.resource !== "records") return "";
  return recordVideoUrl({
    manualPercent:
      form.value.manualPercent === "" ? null : Number(form.value.manualPercent),
    importedPercent:
      !form.value.discardImported &&
      typeof props.row?.importedPercent === "number"
        ? props.row.importedPercent
        : null,
    manualVideo: String(form.value.manualVideo || "").trim(),
    importedVideo: form.value.discardImported
      ? ""
      : String(props.row?.importedVideo || "").trim(),
  });
});
function cancelDateLookup() {
  dateVersion++;
  dateRequest?.abort();
  if (dateTimer) clearTimeout(dateTimer);
  dateTimer = undefined;
  dateBusy.value = false;
}
function manualDateChanged() {
  if (props.resource !== "records") return;
  cancelDateLookup();
  form.value.dateSource = "manual";
  form.value.sourceVideo = "";
  dateMessage.value =
    "Дата задана вручную и не изменится при обновлении видео.";
  dateError.value = false;
}
async function lookupVideoDate() {
  cancelDateLookup();
  const url = recordVideo.value;
  if (!url) return;
  const version = dateVersion;
  const controller = new AbortController();
  dateRequest = controller;
  dateBusy.value = true;
  dateMessage.value = "";
  dateError.value = false;
  try {
    const result = await $fetch<{
      date: string | null;
      source: "video" | null;
      sourceVideo: string;
      message?: string;
    }>("/api/admin/video-date", {
      method: "POST",
      body: { url },
      signal: controller.signal,
    });
    if (
      version !== dateVersion ||
      controller.signal.aborted ||
      recordVideo.value !== url
    )
      return;
    if (result.date) {
      form.value.achievedAt = result.date;
      form.value.dateSource = "video";
      form.value.sourceVideo = result.sourceVideo;
      dateMessage.value =
        "Подставлена дата публикации видео. При необходимости исправь её вручную.";
    } else {
      dateError.value = true;
      dateMessage.value =
        result.message || "Дата видео недоступна. Её можно указать вручную.";
    }
  } catch (cause: any) {
    if (version === dateVersion && !controller.signal.aborted) {
      dateError.value = true;
      dateMessage.value =
        cause.data?.message ||
        "Не удалось получить дату видео. Укажи её вручную.";
    }
  } finally {
    if (version === dateVersion) dateBusy.value = false;
  }
}
watch(recordVideo, (url) => {
  cancelDateLookup();
  dateMessage.value = "";
  dateError.value = false;
  if (form.value.dateSource === "manual") return;
  if (form.value.dateSource === "video") {
    form.value.achievedAt = "";
    form.value.dateSource = null;
    form.value.sourceVideo = "";
  }
  if (!url) return;
  dateBusy.value = true;
  dateTimer = setTimeout(() => void lookupVideoDate(), 500);
});
onBeforeUnmount(cancelDateLookup);
function cancel() {
  if (isBusy.value) return;
  cancelDateLookup();
  emit("cancel");
}
async function save() {
  if (isBusy.value || dateBusy.value) return;
  error.value = "";
  busy.value = true;
  let saved = false;
  try {
    const body: Record<string, unknown> = {};
    if (form.value.id) body.id = form.value.id;
    for (const field of visibleFields.value) {
      let value = form.value[field.key];
      if (
        field.type === "number" ||
        field.valueType === "number" ||
        (field.type === "select" &&
          typeof field.options?.[0]?.value === "number")
      )
        value = value === "" ? null : Number(value);
      if ((field.type === "date" || field.nullable) && value === "")
        value = null;
      body[field.key] = value;
    }
    if (props.resource === "records") {
      body.dateSource = form.value.dateSource;
      body.sourceVideo = form.value.sourceVideo;
    }
    await $fetch(`/api/admin/${props.resource}`, { method: "POST", body });
    initialSnapshot.value = JSON.stringify(form.value);
    saved = true;
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось сохранить";
    await nextTick();
    errorSummary.value?.focus();
  } finally {
    busy.value = false;
  }
  if (saved) emit("saved");
}
onMounted(() => {
  formElement.value
    ?.querySelector<HTMLInputElement>(
      "input:not([type=checkbox]):not([type=file]), textarea, select",
    )
    ?.focus({ preventScroll: true });
});
</script>
<template>
  <form
    ref="formElement"
    class="edit-form panel"
    :aria-labelledby="embedded ? undefined : `${formId}-title`"
    @submit.prevent="save"
  >
    <div v-if="!embedded" class="form-heading">
      <h3 :id="`${formId}-title`">
        {{ title || (form.id ? "Редактирование #" + form.id : "Новая запись") }}
      </h3>
      <button
        type="button"
        class="close-button"
        aria-label="Закрыть редактор"
        :disabled="isBusy"
        @click="cancel"
      >
        <AppIcon name="close" :size="20" />
      </button>
    </div>
    <p
      v-if="error"
      ref="errorSummary"
      class="error feedback"
      role="alert"
      tabindex="-1"
    >
      {{ error }}
    </p>
    <div class="field-grid">
      <div
        v-for="f in visibleFields"
        :key="f.key"
        class="field"
        :class="{
          wide: ['textarea', 'permissions', 'image'].includes(f.type || ''),
          'check-field': f.type === 'checkbox',
        }"
      >
        <template v-if="f.type === 'checkbox'"
          ><label :for="`${formId}-${f.key}`"
            ><input
              :id="`${formId}-${f.key}`"
              v-model="form[f.key]"
              type="checkbox"
              :disabled="busy"
            /><span>{{ f.label }}</span></label
          ></template
        >
        <fieldset
          v-else-if="f.type === 'permissions'"
          class="permissions-field"
          :disabled="busy"
        >
          <legend>{{ f.label }}</legend>
          <div>
            <label v-for="o in f.options" :key="o.value"
              ><input
                v-model="form[f.key]"
                type="checkbox"
                :value="o.value"
              /><span>{{ o.label }}</span></label
            >
          </div>
        </fieldset>
        <template v-else>
          <label :for="`${formId}-${f.key}`"
            >{{ f.label
            }}<span v-if="f.required" class="required" aria-hidden="true"
              >*</span
            ></label
          >
          <ImageField
            v-if="f.type === 'image'"
            :key="`${resource}-${form.id || 'new'}-${f.key}`"
            :id="`${formId}-${f.key}`"
            v-model="form[f.key]"
            :label="f.label"
            :disabled="busy"
            @busy="imageBusy(f.key, $event)"
          />
          <textarea
            v-else-if="f.type === 'textarea'"
            :id="`${formId}-${f.key}`"
            v-model="form[f.key]"
            :required="f.required"
            rows="3"
            :disabled="busy"
          />
          <select
            v-else-if="f.type === 'select'"
            :id="`${formId}-${f.key}`"
            v-model="form[f.key]"
            :required="f.required"
            :disabled="busy"
          >
            <option value="">Не выбрано</option>
            <option
              v-for="o in f.options"
              :key="o.value"
              :value="o.value"
              :disabled="o.disabled && row?.levelId !== o.value"
            >
              {{ o.label }}
            </option>
          </select>
          <input
            v-else
            :id="`${formId}-${f.key}`"
            v-model="form[f.key]"
            :type="f.type || 'text'"
            :required="f.required"
            :step="f.type === 'number' ? 'any' : undefined"
            :disabled="busy"
            :readonly="isGlobalField(f)"
            @input="f.key === 'achievedAt' && manualDateChanged()"
          />
        </template>
        <div
          v-if="resource === 'records' && f.key === 'achievedAt'"
          class="date-tools"
        >
          <button
            type="button"
            :disabled="busy || dateBusy || !recordVideo"
            @click="lookupVideoDate"
          >
            {{ dateBusy ? "Определяем дату…" : "Взять дату из видео" }}
          </button>
          <small
            >Дата публикации YouTube-видео подставляется автоматически. Ручная
            дата имеет приоритет, даже при смене видео.</small
          >
          <p
            v-if="dateMessage"
            :class="{ 'date-error': dateError }"
            role="status"
          >
            {{ dateMessage }}
          </p>
        </div>
        <small v-if="isGlobalField(f)">Обновляется из Global Demonlist.</small>
        <small v-else-if="f.help">{{ f.help }}</small>
      </div>
    </div>
    <AccountPasswordReset
      v-if="resource === 'accounts' && row?.id"
      :key="Number(row.id)"
      :account-id="Number(row.id)"
      :disabled="busy || imageUploads.size > 0"
      @busy="passwordBusy = $event"
    />
    <EntityDeleteButton
      v-if="
        row?.id &&
        (resource === 'levels' ||
          resource === 'records' ||
          resource === 'extras')
      "
      :resource="resource"
      :entity-id="Number(row.id)"
      :disabled="isBusy"
      @saved="emit('saved')"
    />
    <div class="form-actions">
      <button class="primary" :disabled="isBusy || dateBusy">
        <AppIcon name="check" :size="16" />{{
          dateBusy
            ? "Определяем дату…"
            : imageUploads.size
              ? "Загрузка изображения…"
              : busy
                ? "Сохраняем…"
                : "Сохранить"
        }}</button
      ><button type="button" :disabled="isBusy" @click="cancel">Отмена</button
      ><span v-if="fields.some((f) => f.required)"
        ><i>*</i> Обязательные поля</span
      >
    </div>
  </form>
</template>
<style scoped lang="scss">
.edit-form {
  padding: 32px;
  margin-bottom: 24px;
  border-color: var(--accent);
  scroll-margin-top: 100px;
}
.protected-note {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 24px;
}
.form-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 17px;
  margin-bottom: 24px;
  h3 {
    margin: 0;
    font-size: 17px;
  }
}
.close-button {
  display: inline-flex;
  padding: 5px;
  border: 0;
  background: transparent;
  color: var(--muted);
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 26px 32px;
}
.field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  > label {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    font-size: 14px;
  }
  input:not([type="checkbox"]),
  textarea,
  select {
    width: 100%;
    min-width: 0;
    font-size: 14px;
  }
  textarea {
    resize: vertical;
    min-height: 90px;
  }
  small {
    font-size: 14px;
    color: var(--muted);
    line-height: 1.65;
    max-width: 76ch;
  }
  &.wide {
    grid-column: 1 / -1;
  }
  &.check-field {
    justify-content: center;
    > label {
      display: flex;
      flex-wrap: nowrap;
      align-items: flex-start;
      gap: 10px;
      line-height: 1.7;
      cursor: pointer;
    }
  }
}
.required {
  color: var(--warm);
}
input[type="checkbox"] {
  width: 17px;
  height: 17px;
  margin: 2px 0 0;
  accent-color: var(--accent);
  flex-shrink: 0;
}
.permissions-field {
  border: 0;
  margin: 0;
  padding: 0;
  legend {
    padding: 0;
    margin-bottom: 13px;
    font-size: 14px;
  }
  > div {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 15px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    &:has(input:checked) {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
  }
}
.form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border-top: 1px solid var(--line);
  padding-top: 22px;
  margin-top: 24px;
  button {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 14px;
  }
  > span {
    margin-left: auto;
    color: var(--muted);
    font-size: 14px;
    i {
      color: var(--warm);
      font-style: normal;
    }
  }
}
.feedback {
  font-size: 14px;
  line-height: 1.6;
  padding: 14px 16px;
  background: var(--surface-raised);
  border: 1px solid var(--danger);
  border-radius: 8px;
  margin: 0 0 24px;
  color: var(--danger);
}
.date-tools {
  display: grid;
  gap: 10px;
  justify-items: start;
  button {
    font-size: 14px;
    min-height: 42px;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.6;
  }
  .date-error {
    color: var(--danger);
  }
}
@media (max-width: 600px) {
  .field-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .edit-form {
    padding: 20px 16px;
  }
  .form-heading h3 {
    font-size: 15px;
  }
  .form-actions > span {
    flex-basis: 100%;
    margin-left: 0;
    margin-top: 6px;
  }
  .permissions-field > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .permissions-field label {
    font-size: 14px;
    padding: 10px;
    gap: 7px;
  }
}
@media (max-width: 420px) {
  .permissions-field > div {
    grid-template-columns: 1fr;
  }
}
</style>
