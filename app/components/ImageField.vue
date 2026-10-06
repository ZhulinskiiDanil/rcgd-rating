<script setup lang="ts">
const props = defineProps<{
  id: string;
  label: string;
  disabled?: boolean;
}>();
const model = defineModel<string>({ default: "" });
const emit = defineEmits<{ busy: [value: boolean] }>();
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const error = ref("");
const imageFailed = ref(false);
let controller: AbortController | undefined;

watch(model, () => {
  imageFailed.value = false;
});
onBeforeUnmount(() => controller?.abort());

async function upload(event: Event) {
  if (props.disabled || uploading.value) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  error.value = "";
  input.value = "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    error.value = "Выбери изображение JPG, PNG или WebP.";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = "Изображение больше 5 МБ. Выбери файл меньшего размера.";
    return;
  }
  uploading.value = true;
  emit("busy", true);
  const previousValue = model.value;
  const uploadController = new AbortController();
  controller = uploadController;
  try {
    const result = await $fetch<{ url: string }>("/api/admin/media", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
      signal: uploadController.signal,
    });
    if (!uploadController.signal.aborted && model.value === previousValue)
      model.value = result.url;
  } catch (cause: any) {
    if (!uploadController.signal.aborted)
      error.value =
        cause.data?.message ||
        "Не удалось загрузить изображение. Попробуй ещё раз.";
  } finally {
    uploading.value = false;
    emit("busy", false);
  }
}
</script>

<template>
  <div class="image-field" :aria-busy="uploading">
    <div class="image-controls">
      <input
        :id="id"
        v-model="model"
        type="text"
        inputmode="url"
        placeholder="https://… или загрузи изображение"
        :aria-label="label"
        :aria-describedby="`${id}-hint${error ? ` ${id}-error` : ''}`"
        :disabled="disabled || uploading"
      />
      <div class="image-actions">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          tabindex="-1"
          aria-hidden="true"
          :disabled="disabled || uploading"
          @change="upload"
        />
        <button
          type="button"
          :disabled="disabled || uploading"
          @click="fileInput?.click()"
        >
          {{ uploading ? "Загружаем…" : "Загрузить изображение" }}
        </button>
        <button
          v-if="model"
          type="button"
          class="clear-image"
          :disabled="disabled || uploading"
          @click="
            model = '';
            error = '';
          "
        >
          Очистить
        </button>
      </div>
      <span :id="`${id}-hint`" class="image-hint"
        >JPG, PNG или WebP · до 5 МБ. После выбора сохрани запись.</span
      >
      <p v-if="error" :id="`${id}-error`" class="image-error" role="alert">
        {{ error }}
      </p>
    </div>
    <div v-if="model" class="image-preview">
      <img
        v-if="!imageFailed"
        :src="model"
        :alt="`Превью: ${label}`"
        @error="imageFailed = true"
      />
      <span v-else>Изображение недоступно</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.image-field {
  display: flex;
  align-items: start;
  gap: 18px;
  min-width: 0;
}
.image-controls {
  flex: 1;
  min-width: 0;
  > input {
    width: 100%;
    min-width: 0;
    font-size: 15px;
  }
}
.image-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  button {
    font-size: 14px;
    min-height: 42px;
  }
}
.file-input {
  display: none;
}
.clear-image {
  color: var(--muted);
  background: transparent;
}
.image-hint {
  display: block;
  margin-top: 12px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
}
.image-error {
  color: var(--danger);
  font-size: 14px;
  margin: 10px 0 0;
  line-height: 1.6;
}
.image-preview {
  width: 132px;
  height: 96px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-raised);
  overflow: hidden;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  span {
    color: var(--muted);
    font-size: 12px;
    text-align: center;
    padding: 8px;
  }
}
@media (max-width: 600px) {
  .image-field {
    flex-direction: column-reverse;
  }
  .image-controls {
    width: 100%;
  }
}
</style>
