<script setup lang="ts">
import type { AdminData } from "../types/admin";
const { target, notice, canEdit } = useEntityEditor();
const dialog = ref<HTMLDialogElement | null>(null);
const continueButton = ref<HTMLButtonElement | null>(null);
const data = shallowRef<AdminData | null>(null);
const schemas = useAdminSchemas(data);
const loading = ref(false),
  busy = ref(false),
  dirty = ref(false),
  confirmClose = ref(false),
  error = ref("");
const schema = computed(() =>
  target.value ? schemas.value[target.value.resource] : undefined,
);
const row = computed(() =>
  schema.value?.rows.find((row) => row.id === target.value?.entityId),
);
const allowed = computed(
  () => !!target.value && canEdit(target.value.resource),
);
let trigger: HTMLElement | null = null;
let controller: AbortController | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

async function load() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = "";
  try {
    const result = await $fetch("/api/admin", {
      signal: request.signal,
      query:
        target.value?.resource === "news" && target.value.entityId
          ? { newsId: target.value.entityId }
          : undefined,
    });
    if (!request.signal.aborted) data.value = result;
  } catch (cause: any) {
    if (!request.signal.aborted)
      error.value =
        cause.data?.message || "Не удалось загрузить запись. Попробуй ещё раз.";
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
function close() {
  if (busy.value) return;
  controller?.abort();
  dialog.value?.close();
  target.value = null;
  trigger?.isConnected && trigger.focus({ preventScroll: true });
}
async function requestClose() {
  if (busy.value) return;
  if (dirty.value) {
    confirmClose.value = true;
    await nextTick();
    continueButton.value?.focus();
  } else close();
}
async function saved() {
  dirty.value = false;
  busy.value = true;
  // Refresh public rankings, history and the current account without navigating away.
  try {
    await refreshNuxtData();
    notice.value = "Изменения сохранены";
  } catch {
    notice.value =
      "Изменения сохранены. Обнови страницу, чтобы увидеть новые данные.";
  } finally {
    busy.value = false;
    close();
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice.value = "";
    }, 6000);
  }
}
watch(target, async (value) => {
  if (!value) return;
  trigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  data.value = null;
  dirty.value = false;
  confirmClose.value = false;
  busy.value = false;
  await nextTick();
  dialog.value?.showModal();
  await load();
});
watch(allowed, (value) => {
  if (target.value && !value && !busy.value) close();
});
onBeforeUnmount(() => {
  controller?.abort();
  clearTimeout(noticeTimer);
});
</script>
<template>
  <Teleport to=".app">
    <div v-if="notice" class="editor-notice" role="status">
      <AppIcon name="check" :size="18" />{{ notice
      }}<button
        type="button"
        aria-label="Скрыть уведомление"
        @click="notice = ''"
      >
        ×
      </button>
    </div>
    <dialog
      v-if="target"
      ref="dialog"
      class="entity-dialog"
      aria-labelledby="entity-dialog-title"
      :aria-busy="loading || busy"
      @cancel.prevent="requestClose"
      @click="$event.target === dialog && requestClose()"
    >
      <div class="dialog-body">
        <header class="dialog-header">
          <div>
            <span>Быстрое редактирование</span>
            <h2 id="entity-dialog-title">{{ target.title }}</h2>
          </div>
          <button
            type="button"
            :disabled="busy"
            aria-label="Закрыть окно редактирования"
            @click="requestClose"
          >
            <AppIcon name="close" />
          </button>
        </header>
        <div v-if="confirmClose" class="unsaved" role="alert">
          <strong>Есть несохранённые изменения</strong>
          <p>Продолжить редактирование или закрыть форму?</p>
          <div>
            <button
              ref="continueButton"
              type="button"
              @click="confirmClose = false"
            >
              Продолжить редактирование</button
            ><button type="button" :disabled="busy" @click="close">
              Закрыть без сохранения
            </button>
          </div>
        </div>
        <p v-if="loading" class="loading" role="status">Загружаем запись…</p>
        <div v-else-if="error" class="load-error" role="alert">
          <p>{{ error }}</p>
          <button type="button" @click="load">Повторить</button>
        </div>
        <p v-else-if="!allowed" role="alert">
          Недостаточно прав для изменения этой записи.
        </p>
        <p v-else-if="target.entityId && !row" role="alert">
          Запись больше недоступна. Обнови страницу.
        </p>
        <EntityForm
          v-else-if="schema"
          embedded
          :key="`${target.resource}-${target.entityId || 'new'}`"
          :resource="target.resource"
          :fields="schema.fields"
          :row="row"
          :defaults="target.defaults"
          :title="row?.name ? String(row.name) : undefined"
          @saved="saved"
          @cancel="requestClose"
          @busy="busy = $event"
          @dirty="dirty = $event"
        />
      </div>
    </dialog>
  </Teleport>
</template>
<style scoped lang="scss">
.entity-dialog {
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 20px;
  max-width: min(940px, calc(100vw - 40px));
  width: 940px;
  max-height: calc(100dvh - 48px);
  color: var(--text);
  background: var(--surface);
  box-shadow: 0 24px 100px #0005;
  overflow: auto;
  font:
    16px/1.6 "Golos Text",
    sans-serif;
  box-sizing: border-box;
}
.entity-dialog::backdrop {
  background: #06112699;
  backdrop-filter: blur(4px);
}
.dialog-body {
  padding: 28px;
}
.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.dialog-header span {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}
.dialog-header h2 {
  font-size: 26px;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin: 0;
}
.dialog-header > button {
  padding: 8px;
  border: 0;
  background: var(--surface-raised);
  flex-shrink: 0;
}
.entity-dialog :deep(.edit-form) {
  margin: 0;
  box-shadow: none;
  border: 0;
  padding: 0;
  background: transparent;
}
.unsaved {
  background: var(--warm-soft);
  border: 1px solid var(--warm);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 22px;
}
.unsaved strong {
  color: var(--warm);
}
.unsaved p {
  margin: 6px 0 14px;
}
.unsaved > div {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.loading {
  padding: 35px;
  text-align: center;
  color: var(--muted);
}
.load-error {
  padding: 20px;
  color: var(--danger);
}
.editor-notice {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--success);
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: var(--shadow);
  font:
    14px/1.5 "Golos Text",
    sans-serif;
  max-width: calc(100vw - 40px);
  box-sizing: border-box;
}
.editor-notice > svg {
  color: var(--success);
}
.editor-notice button {
  background: none;
  border: 0;
  color: var(--muted);
  font-size: 22px;
  cursor: pointer;
}
@media (max-width: 600px) {
  .entity-dialog {
    max-width: calc(100vw - 20px);
    max-height: calc(100dvh - 24px);
    border-radius: 14px;
  }
  .dialog-body {
    padding: 20px 16px;
  }
  .dialog-header {
    gap: 12px;
  }
  .dialog-header h2 {
    font-size: 22px;
  }
  .editor-notice {
    width: max-content;
    bottom: 16px;
  }
  .unsaved {
    padding: 14px;
  }
  .unsaved > div {
    flex-direction: column;
  }
}
</style>
