<script setup lang="ts">
const { data: session, refresh } = await useAccount();
const user = computed(() => session.value?.user);
if (!user.value) await navigateTo("/login");
const nickname = ref(user.value?.nickname || ""),
  login = ref(user.value?.login || "");
const currentPassword = ref(""),
  password = ref(""),
  confirmation = ref("");
const busy = ref(false),
  avatarBusy = ref(false),
  error = ref(""),
  message = ref("");
useHead({ title: "Настройки профиля — СПб Demonlist" });
async function saveNickname() {
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    await $fetch("/api/account/profile", {
      method: "PATCH",
      body: { nickname: nickname.value },
    });
    await refreshNuxtData();
    message.value = "Ник сохранён.";
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось сохранить ник.";
  } finally {
    busy.value = false;
  }
}
async function savePassword() {
  error.value = "";
  message.value = "";
  if (password.value !== confirmation.value) {
    error.value = "Пароли не совпадают.";
    return;
  }
  busy.value = true;
  try {
    const completingReset = !!user.value?.passwordResetRequired;
    const result = await $fetch("/api/account/password", {
      method: "POST",
      body: {
        login: login.value,
        currentPassword: currentPassword.value || undefined,
        password: password.value,
      },
    });
    currentPassword.value = "";
    password.value = "";
    confirmation.value = "";
    await refresh();
    message.value = "Логин и пароль сохранены.";
    if (completingReset && result.url !== "/account/settings")
      await navigateTo(result.url);
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось сохранить пароль.";
    if (cause.statusCode === 403 || cause.status === 403) await refresh();
  } finally {
    busy.value = false;
  }
}
async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  error.value = "";
  message.value = "";
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    error.value = "Выберите PNG, JPEG или WebP до 5 МБ.";
    input.value = "";
    return;
  }
  avatarBusy.value = true;
  try {
    await $fetch("/api/account/avatar", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type },
    });
    await refreshNuxtData();
    message.value = "Аватарка сохранена.";
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось загрузить аватарку.";
  } finally {
    avatarBusy.value = false;
    input.value = "";
  }
}
async function resetAvatar() {
  avatarBusy.value = true;
  error.value = "";
  message.value = "";
  try {
    await $fetch("/api/account/avatar", { method: "DELETE" });
    await refreshNuxtData();
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось сбросить аватарку.";
  } finally {
    avatarBusy.value = false;
  }
}
async function logout() {
  busy.value = true;
  try {
    await $fetch("/api/auth/logout", { method: "POST" });
    clearNuxtData();
    useState("entity-editor").value = null;
    await refresh();
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel("spb-account");
      channel.postMessage("changed");
      channel.close();
    }
    await navigateTo("/");
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось выйти.";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section v-if="user" class="settings">
    <div class="page-heading">
      <h1>Настройки профиля</h1>
      <NuxtLink v-if="user.playerId" :to="`/players/${user.playerId}`"
        >К моим достижениям<AppIcon name="arrow" :size="16"
      /></NuxtLink>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="message" class="status" role="status">{{ message }}</p>
    <p v-if="user.passwordResetRequired" class="status" role="status">
      Вы вошли с временным паролем. Замените его на свой, чтобы продолжить.
    </p>
    <section v-if="!user.passwordResetRequired" class="panel profile-settings">
      <div class="avatar-settings">
        <UserAvatar :name="user.nickname" :url="user.avatar" class="avatar" />
        <div>
          <h2>Аватарка</h2>
          <p v-if="user.avatarLocked" class="muted">
            Администрация запретила изменение аватарки.
          </p>
          <template v-else
            ><label
              >Загрузить изображение<input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                :disabled="avatarBusy"
                @change="uploadAvatar" /></label
            ><small>PNG, JPEG или WebP, до 5 МБ.</small
            ><button type="button" :disabled="avatarBusy" @click="resetAvatar">
              Сбросить аватарку
            </button></template
          >
        </div>
      </div>
      <form @submit.prevent="saveNickname">
        <label
          >Ник в профиле<input
            v-model="nickname"
            required
            maxlength="64"
            autocomplete="nickname" /></label
        ><button class="primary" :disabled="busy">Сохранить ник</button>
      </form>
      <p v-if="user.headAdmin" class="muted">Главный администратор</p>
      <p v-else-if="user.seniorAdmin" class="senior-role">
        Старший администратор
      </p>
      <p v-else-if="user.permissions.length" class="muted">Администратор</p>
    </section>
    <section class="panel password-settings">
      <h2>
        {{
          user.passwordResetRequired
            ? "Замените временный пароль"
            : user.hasPassword
              ? "Логин и пароль"
              : "Задайте логин и пароль"
        }}
      </h2>
      <form
        v-if="user.hasPassword || user.canResetPassword"
        @submit.prevent="savePassword"
      >
        <label
          >Логин<input
            v-model="login"
            required
            maxlength="64"
            autocomplete="username"
        /></label>
        <label v-if="!user.canResetPassword || user.passwordResetRequired"
          >{{
            user.passwordResetRequired
              ? "Временный пароль"
              : "Действующий пароль"
          }}<input
            v-model="currentPassword"
            type="password"
            required
            maxlength="128"
            autocomplete="current-password"
        /></label>
        <label
          >Новый пароль<input
            v-model="password"
            type="password"
            minlength="8"
            maxlength="128"
            required
            autocomplete="new-password"
        /></label>
        <label
          >Повторите новый пароль<input
            v-model="confirmation"
            type="password"
            minlength="8"
            maxlength="128"
            required
            autocomplete="new-password"
        /></label>
        <small
          >Не менее 8 символов. После смены пароля другие устройства выйдут из
          аккаунта.</small
        >
        <button class="primary" :disabled="busy">
          {{ busy ? "Сохраняем…" : "Сохранить пароль" }}
        </button>
      </form>
      <p v-else>
        Для задания пароля
        <NuxtLink to="/login">подтвердите прежний вход</NuxtLink>.
      </p>
    </section>
    <div class="settings-actions">
      <NuxtLink
        v-if="user.headAdmin || user.seniorAdmin || user.permissions.length"
        class="button"
        to="/admin"
        >Открыть админку</NuxtLink
      ><button :disabled="busy" @click="logout">Выйти</button>
    </div>
  </section>
</template>
<style scoped lang="scss">
.senior-role {
  color: var(--success);
}
.settings {
  max-width: 780px;
  margin-inline: auto;
}
.page-heading {
  margin-bottom: 28px;
  a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
}
.panel {
  padding: 28px;
  margin-bottom: 22px;
  h2 {
    margin: 0 0 18px;
    font-size: 23px;
  }
}
form {
  display: grid;
  gap: 16px;
  input {
    width: 100%;
    min-width: 0;
  }
  button {
    justify-self: start;
  }
}
small {
  display: block;
  color: var(--muted);
  line-height: 1.6;
}
.avatar-settings {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 28px;
  > div {
    flex: 1;
    min-width: 0;
  }
  input {
    max-width: 100%;
  }
  button {
    margin-top: 12px;
  }
  small {
    margin-top: 9px;
  }
}
.avatar {
  width: 94px;
  height: 94px;
  border-radius: 18px;
  flex-shrink: 0;
}
.settings-actions {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
@media (max-width: 600px) {
  .panel {
    padding: 22px 18px;
  }
  .avatar-settings {
    gap: 16px;
    flex-wrap: wrap;
  }
  .avatar {
    width: 76px;
    height: 76px;
  }
}
</style>
