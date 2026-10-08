<script setup lang="ts">
const props = defineProps<{ accountId: number; disabled?: boolean }>();
const emit = defineEmits<{ busy: [value: boolean] }>();
const { data: session } = await useAccount();
const confirming = ref(false),
  busy = ref(false),
  error = ref("");
const issued = ref<{ login: string; password: string } | null>(null);
const copied = ref(false);
async function reset() {
  busy.value = true;
  emit("busy", true);
  error.value = "";
  try {
    issued.value = await $fetch("/api/admin/account-password", {
      method: "POST",
      body: { id: props.accountId },
    });
    confirming.value = false;
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось восстановить пароль.";
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(
      `Логин: ${issued.value!.login}\nВременный пароль: ${issued.value!.password}`,
    );
    copied.value = true;
  } catch {
    error.value = "Скопируйте логин и пароль вручную.";
  }
}
</script>
<template>
  <section
    v-if="
      (session?.user?.headAdmin || session?.user?.seniorAdmin) &&
      session.user.id !== accountId
    "
    class="password-recovery"
  >
    <h4>Восстановление доступа</h4>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="issued" class="credentials" role="status">
      <p>Передайте игроку эти данные. При входе он задаст свой пароль.</p>
      <dl>
        <dt>Логин</dt>
        <dd>{{ issued.login }}</dd>
        <dt>Временный пароль</dt>
        <dd>
          <code>{{ issued.password }}</code>
        </dd>
      </dl>
      <button type="button" @click="copy">
        {{ copied ? "Скопировано" : "Скопировать" }}
      </button>
      <small
        >Пароль показывается только сейчас. После закрытия окна его можно только
        перевыпустить.</small
      >
    </div>
    <template v-else-if="confirming">
      <p>
        Текущий пароль перестанет работать, а устройства этого игрока выйдут из
        аккаунта. Достижения и права сохранятся.
      </p>
      <div class="actions">
        <button type="button" :disabled="disabled || busy" @click="reset">
          {{ busy ? "Создаём…" : "Выдать временный пароль" }}</button
        ><button type="button" :disabled="busy" @click="confirming = false">
          Отмена
        </button>
      </div>
    </template>
    <button
      v-else
      type="button"
      :disabled="disabled"
      @click="confirming = true"
    >
      Восстановить пароль
    </button>
  </section>
</template>
<style scoped lang="scss">
.password-recovery {
  border-top: 1px solid var(--line);
  margin-top: 24px;
  padding-top: 20px;
  h4 {
    margin: 0 0 14px;
  }
  p,
  small {
    line-height: 1.6;
  }
  small {
    display: block;
    color: var(--muted);
    margin-top: 12px;
  }
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
dl {
  display: grid;
  gap: 8px;
}
dt {
  color: var(--muted);
  font-size: 13px;
}
dd {
  margin: 0 0 8px;
  overflow-wrap: anywhere;
  user-select: all;
}
</style>
