<script setup lang="ts">
const { data: providers } = await useFetch("/api/auth/providers");
const { refresh } = await useAccount();
const register = ref(false),
  login = ref(""),
  nickname = ref(""),
  password = ref(""),
  showPassword = ref(false),
  busy = ref(false);
const error = ref(
  useRoute().query.error
    ? "Не удалось подтвердить старый аккаунт. Попробуйте снова или обратитесь к администрации."
    : "",
);
useHead({ title: "Вход — СПб Demonlist" });
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    const result = await $fetch(
      register.value ? "/api/auth/register" : "/api/auth/login",
      {
        method: "POST",
        body: {
          login: login.value,
          nickname: nickname.value || undefined,
          password: password.value,
        },
      },
    );
    clearNuxtData();
    await refresh();
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel("spb-account");
      channel.postMessage("changed");
      channel.close();
    }
    await navigateTo(result.url);
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось войти.";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="login-layout">
    <div class="login-context">
      <h1>Твой профиль<br />в листе города.</h1>
      <p>
        Игроки, достижения и самые сложные демоны Петербурга — в одном месте.
      </p>
      <NuxtLink to="/" class="back-link"
        ><AppIcon name="list" :size="17" /> Смотреть лист без входа</NuxtLink
      >
    </div>
    <div class="login-card panel">
      <div class="card-heading">
        <AppIcon name="user" :size="25" />
        <h2>{{ register ? "Создать аккаунт" : "Войти в профиль" }}</h2>
      </div>
      <form @submit.prevent="submit">
        <label
          >Логин<input
            v-model="login"
            autocomplete="username"
            :pattern="register ? '[a-zA-Z0-9_.-]{3,32}' : undefined"
            :maxlength="register ? 32 : 64"
            required
        /></label>
        <label v-if="register"
          >Ник в профиле<input
            v-model="nickname"
            autocomplete="nickname"
            maxlength="64"
        /></label>
        <label
          >Пароль<span class="password-field"
            ><input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="register ? 'new-password' : 'current-password'"
              :minlength="register ? 12 : 1"
              maxlength="128"
              required
            /><button
              type="button"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? "Скрыть" : "Показать" }}
            </button></span
          ></label
        >
        <small v-if="register"
          >Логин — 3–32 латинских символа, цифры, _, . или -. Пароль — от 12
          символов. Видимые ники могут совпадать.</small
        >
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="primary" :disabled="busy">
          {{ busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти" }}
        </button>
      </form>
      <button
        class="mode-switch"
        :disabled="busy"
        @click="
          register = !register;
          error = '';
        "
      >
        {{ register ? "Уже есть аккаунт? Войти" : "Создать аккаунт" }}
      </button>
      <details
        v-if="!register && (providers?.discord || providers?.google)"
        class="recovery"
      >
        <summary>Раньше входили через сервис?</summary>
        <p>
          Подтвердите прежний аккаунт и задайте пароль. Достижения сохранятся.
        </p>
        <a v-if="providers?.discord" href="/auth/discord"
          >Подтвердить через Discord</a
        >
        <a v-if="providers?.google" href="/auth/google"
          >Подтвердить через Google</a
        >
      </details>
    </div>
  </section>
</template>
<style scoped lang="scss">
.login-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 470px);
  gap: 70px;
  align-items: center;
  max-width: 1220px;
  margin: 74px auto 96px;
}
.login-context {
  h1 {
    font-size: clamp(36px, 4.8vw, 62px);
    line-height: 1.2;
    letter-spacing: -0.04em;
    margin: 0 0 18px;
  }
  p {
    max-width: 36ch;
    color: var(--muted);
    font-size: 19px;
    line-height: 1.7;
  }
}
.back-link,
.card-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.back-link {
  font-size: 14px;
  margin-top: 20px;
}
.login-card {
  padding: 38px;
}
.card-heading {
  color: var(--accent);
  margin-bottom: 24px;
  h2 {
    margin: 0;
    font-size: 24px;
    color: var(--text);
  }
}
form {
  display: grid;
  gap: 18px;
  small {
    color: var(--muted);
    line-height: 1.6;
  }
  input {
    width: 100%;
    min-width: 0;
    min-height: 48px;
  }
}
.password-field {
  position: relative;
  display: flex;
  input {
    padding-right: 90px;
  }
  button {
    position: absolute;
    right: 4px;
    top: 4px;
    bottom: 4px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
  }
}
.mode-switch {
  display: block;
  margin: 18px auto;
  background: transparent;
  border: 0;
  color: var(--accent);
}
.recovery {
  border-top: 1px solid var(--line);
  padding-top: 18px;
  font-size: 14px;
  color: var(--muted);
  summary {
    cursor: pointer;
  }
  p {
    line-height: 1.6;
  }
  a {
    display: block;
    margin-top: 10px;
  }
}
@media (max-width: 800px) {
  .login-layout {
    gap: 32px;
    grid-template-columns: 1fr;
    max-width: 500px;
    margin: 30px auto;
  }
  .login-context h1 {
    font-size: 36px;
  }
  .login-card {
    padding: 26px;
  }
}
</style>
