<script setup lang="ts">
const { data: providers } = await useFetch("/api/auth/providers");
const { refresh } = await useAccount();
const register = ref(false),
  login = ref(""),
  password = ref(""),
  showPassword = ref(false),
  busy = ref(false),
  error = ref(
    useRoute().query.error
      ? "Не удалось войти через внешний сервис. Проверьте привязку или попробуйте снова."
      : "",
  );
useHead({ title: "Вход — СПб Demonlist" });
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await $fetch(register.value ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: { login: login.value, password: password.value },
    });
    await refresh();
    await navigateTo("/account");
  } catch (e: any) {
    error.value = e.data?.message || "Ошибка входа";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="login-layout">
    <div class="login-context">
      <div class="cube-scene" aria-hidden="true">
        <div class="cube"><span></span><span></span><i></i></div>
        <div class="ground"></div>
      </div>
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
        <h2>{{ register ? "Создать аккаунт" : "С возвращением" }}</h2>
      </div>
      <p class="login-description">
        {{
          register
            ? "Зарегистрируйся, чтобы связать аккаунт с карточкой игрока."
            : "Войди, чтобы открыть свой профиль и доступные тебе разделы."
        }}
      </p>
      <form @submit.prevent="submit">
        <label
          >Логин<input
            v-model="login"
            autocomplete="username"
            required
            pattern="[a-zA-Z0-9_.-]{3,32}"
            maxlength="32"
            placeholder="Твой ник"
        /></label>
        <label
          >Пароль
          <span class="password-field">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="register ? 'new-password' : 'current-password'"
              :minlength="register ? 12 : 1"
              maxlength="128"
              required
              :placeholder="register ? 'Не менее 12 символов' : 'Введи пароль'"
            />
            <button
              type="button"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? "Скрыть" : "Показать" }}
            </button>
          </span>
        </label>
        <small v-if="register" class="field-help"
          >Пароль — от 12 символов. Логин — 3–32 латинские буквы, цифры или
          символы _, . и -.</small
        >
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="primary submit" :disabled="busy">
          {{ busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти"
          }}<AppIcon v-if="!busy" name="arrow" :size="17" />
        </button>
      </form>
      <div v-if="providers?.discord || providers?.google" class="providers">
        <span>Или через сервис</span>
        <div>
          <a v-if="providers?.discord" href="/auth/discord"
            >Discord<AppIcon name="external" :size="15"
          /></a>
          <a v-if="providers?.google" href="/auth/google"
            >Google<AppIcon name="external" :size="15"
          /></a>
        </div>
      </div>
      <p class="switch-mode">
        {{ register ? "Уже зарегистрирован?" : "Ещё нет аккаунта?" }}
        <button
          type="button"
          :disabled="busy"
          @click="
            register = !register;
            error = '';
          "
        >
          {{ register ? "Войти" : "Зарегистрироваться" }}
        </button>
      </p>
      <p class="access-note">
        <AppIcon name="shield" :size="17" /> Права на изменение данных выдаёт
        head-admin.
      </p>
    </div>
  </section>
</template>
<style scoped lang="scss">
.login-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 470px);
  gap: 90px;
  align-items: center;
  max-width: 1220px;
  margin: 74px auto 96px;
}
.login-context {
  h1 {
    font-size: clamp(36px, 4.8vw, 62px);
    line-height: 1.2;
    letter-spacing: -0.04em;
    margin: 32px 0 18px;
  }
  p {
    max-width: 36ch;
    color: var(--muted);
    font-size: 19px;
    line-height: 1.7;
  }
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  margin-top: 15px;
}
.cube-scene {
  width: 180px;
  height: 136px;
  position: relative;
}
.cube {
  position: absolute;
  width: 86px;
  height: 86px;
  border: 3px solid var(--accent);
  background: var(--surface-raised);
  transform: rotate(-13deg);
  top: 12px;
  left: 34px;
  box-shadow:
    inset 0 0 0 7px var(--bg),
    inset 0 0 0 9px var(--accent);
  span {
    position: absolute;
    top: 23px;
    width: 13px;
    height: 17px;
    background: var(--accent);
    &:first-child {
      left: 19px;
    }
    &:nth-child(2) {
      right: 19px;
    }
  }
  i {
    position: absolute;
    height: 9px;
    left: 20px;
    right: 20px;
    bottom: 22px;
    background: var(--accent);
  }
}
.ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-bottom: 2px solid var(--line);
  &::before,
  &::after {
    content: "";
    position: absolute;
    height: 10px;
    bottom: 0;
    border-left: 2px solid var(--line);
  }
  &::before {
    left: 20px;
  }
  &::after {
    right: 20px;
  }
}
.login-card {
  padding: 38px;
}
.card-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--accent);
  h2 {
    font-size: 24px;
    margin: 0;
    line-height: 1.5;
    color: var(--text);
  }
}
.login-description {
  margin: 14px 0 27px;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.65;
}
form {
  display: grid;
  gap: 19px;
  label {
    gap: 8px;
    font-size: 16px;
    font-weight: 500;
  }
  input {
    width: 100%;
    min-width: 0;
    min-height: 52px;
  }
}
.password-field {
  position: relative;
  display: flex;
  input {
    padding-right: 88px;
  }
  button {
    position: absolute;
    top: 3px;
    bottom: 3px;
    right: 5px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    font-size: 14px;
    color: var(--muted);
  }
}
.field-help {
  color: var(--muted);
  line-height: 1.6;
  margin-top: -9px;
}
.submit {
  width: 100%;
  min-height: 52px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 3px;
}
.error {
  margin: 0;
  font-size: 14px;
}
.providers {
  margin-top: 25px;
  > span {
    display: block;
    color: var(--muted);
    text-align: center;
    font-size: 14px;
    margin-bottom: 14px;
  }
  > div {
    display: flex;
    gap: 10px;
  }
  a {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
    font-size: 14px;
    color: var(--text);
    text-decoration: none;
    &:hover {
      background: var(--surface-raised);
    }
  }
}
.switch-mode {
  display: flex;
  justify-content: center;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 6px;
  font-size: 14px;
  margin: 23px 0;
  color: var(--muted);
  button {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--accent);
    font-size: inherit;
  }
}
.access-note {
  margin: 0;
  border-top: 1px solid var(--line);
  padding-top: 20px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  display: flex;
  gap: 9px;
  align-items: flex-start;
  svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
}
@media (max-width: 800px) {
  .login-layout {
    gap: 35px;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    margin: 38px auto;
  }
  .login-card {
    padding: 24px;
  }
  .login-context h1 {
    font-size: 36px;
  }
}
@media (max-width: 620px) {
  .login-layout {
    grid-template-columns: 1fr;
    max-width: 440px;
    margin: 25px auto;
  }
  .login-context {
    h1 {
      font-size: 32px;
      margin-top: 0;
      br {
        display: none;
      }
    }
    p {
      margin-bottom: 0;
      max-width: none;
      font-size: 14px;
    }
  }
  .cube-scene {
    display: none;
  }
  .back-link {
    font-size: 14px;
    margin-top: 12px;
  }
  .login-card {
    padding: 24px 20px;
  }
}
</style>
