<script setup lang="ts">
import { permissionLabels } from "#shared/types/domain";
const { data: session, refresh } = await useAccount();
const user = computed(() => session.value?.user);
if (!user.value) await navigateTo("/login");
const { data: providers } = await useFetch("/api/auth/providers");
const { data: catalog } = await useCatalog();
const player = computed(() =>
  catalog.value?.players.find((p) => p.accountId === user.value?.id),
);
const error = ref(""),
  busy = ref(false);
const canAdmin = computed(
  () => user.value?.headAdmin || user.value?.permissions.length,
);
const nickname = ref(user.value?.nickname || user.value?.login || "");
const profileBusy = ref(false),
  profileMessage = ref("");
async function saveNickname() {
  profileBusy.value = true;
  error.value = "";
  profileMessage.value = "";
  try {
    await $fetch("/api/account/profile", {
      method: "PATCH",
      body: { nickname: nickname.value },
    });
    await refreshNuxtData();
    profileMessage.value = "Ник сохранён.";
  } catch (cause: any) {
    error.value = cause.data?.message || "Не удалось изменить ник.";
  } finally {
    profileBusy.value = false;
  }
}
useHead({ title: "Мой аккаунт — СПб Demonlist" });
async function logout() {
  busy.value = true;
  error.value = "";
  try {
    await $fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    await navigateTo("/");
  } catch (e: any) {
    error.value = e.data?.message || "Не удалось выйти. Попробуй ещё раз.";
  } finally {
    busy.value = false;
  }
}
async function link(provider: "google" | "discord") {
  error.value = "";
  busy.value = true;
  try {
    const result = await $fetch("/api/auth/link", {
      method: "POST",
      body: { provider },
    });
    await navigateTo(result.url, { external: true });
  } catch (e: any) {
    error.value = e.data?.message || "Не удалось привязать профиль";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section v-if="user" class="account">
    <div class="page-heading">
      <div>
        <h1>Мой аккаунт</h1>
        <p class="page-intro">
          Профиль, способы входа и доступ к управлению листом.
        </p>
      </div>
      <button class="logout" :disabled="busy" @click="logout">
        Выйти из аккаунта<AppIcon name="arrow" :size="16" />
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="account-layout">
      <aside class="profile panel">
        <UserAvatar
          :name="user.nickname || user.login"
          :url="user.avatar"
          class="profile-avatar"
        />
        <h2>{{ user.nickname || user.login }}</h2>
        <div class="account-edit">
          <EntityEditButton
            resource="accounts"
            :entity-id="user.id"
            label="Изменить аватар аккаунта"
          />
        </div>
        <span class="role" :class="{ elevated: canAdmin }"
          ><AppIcon :name="canAdmin ? 'shield' : 'user'" :size="14" />{{
            user.headAdmin
              ? "Head-admin"
              : canAdmin
                ? "Администрация"
                : "Участник"
          }}</span
        >
        <div class="player-link">
          <template v-if="player"
            ><span>Карточка игрока</span
            ><NuxtLink :to="`/players/${player.id}`"
              >{{ player.name }}<AppIcon name="arrow" :size="17" /></NuxtLink
            ><EntityEditButton
              resource="players"
              :entity-id="player.id"
              label="Редактировать игрока"
          /></template>
          <template v-else
            ><AppIcon name="users" :size="23" />
            <p>Карточка игрока ещё не привязана.</p>
            <small
              >Администрация может связать её с твоим аккаунтом.</small
            ></template
          >
        </div>
        <NuxtLink v-if="canAdmin" to="/admin" class="admin-link"
          ><AppIcon name="shield" :size="17" /> Открыть админку</NuxtLink
        >
      </aside>
      <div class="account-details">
        <section class="detail-section panel">
          <h2>Твой ник</h2>
          <form class="nickname-form" @submit.prevent="saveNickname">
            <label
              >Имя в профиле<input
                v-model="nickname"
                required
                minlength="1"
                maxlength="64"
                autocomplete="nickname" /></label
            ><button class="primary" :disabled="profileBusy">
              {{ profileBusy ? "Сохраняем…" : "Сохранить ник" }}
            </button>
          </form>
          <p class="muted">
            Логин для входа: <span class="entity-id">{{ user.login }}</span
            >.
          </p>
          <p v-if="profileMessage" role="status">{{ profileMessage }}</p>
        </section>
        <section v-if="player" class="detail-section panel">
          <h2>Мои достижения</h2>
          <NuxtLink
            class="button"
            :to="`/players/${player.id}?filter=completed`"
            >Пройденные уровни</NuxtLink
          ><NuxtLink
            class="button"
            :to="`/forecast?type=players&id=${player.id}`"
            >Будущий рейтинг</NuxtLink
          >
        </section>
        <section class="detail-section panel">
          <div class="section-heading">
            <AppIcon name="shield" :size="21" />
            <h2>Твои права</h2>
          </div>
          <template v-if="user.headAdmin"
            ><p>
              Полный доступ ко всем разделам. Ты можешь управлять листом и
              выдавать права другим аккаунтам.
            </p>
            <div class="permission-list">
              <span v-for="label in permissionLabels" :key="label"
                ><AppIcon name="check" :size="14" />{{ label }}</span
              ><span><AppIcon name="check" :size="14" />Аккаунты</span>
            </div></template
          >
          <template v-else-if="user.permissions.length"
            ><p>Администрация открыла тебе доступ к следующим разделам.</p>
            <div class="permission-list">
              <span v-for="permission in user.permissions" :key="permission"
                ><AppIcon name="check" :size="14" />{{
                  permissionLabels[permission]
                }}</span
              >
            </div></template
          >
          <template v-else
            ><p>Сейчас доступен просмотр листа и рейтингов.</p>
            <p class="muted">
              Права на управление уровнями, игроками и рекордами выдаёт
              head-admin.
            </p></template
          >
        </section>
        <section class="detail-section panel">
          <div class="section-heading">
            <AppIcon name="user" :size="21" />
            <h2>Аватар и способы входа</h2>
          </div>
          <p>
            Привяжи сервис к этому аккаунту, чтобы входить с его помощью.
            Администрация может назначить свой аватар. Иначе берём его из
            Discord, затем из Google или создаём по имени.
          </p>
          <div
            v-if="providers?.discord || providers?.google"
            class="provider-actions"
          >
            <button
              v-if="providers?.discord"
              :disabled="busy"
              @click="link('discord')"
            >
              Привязать Discord<AppIcon name="external" :size="15" />
            </button>
            <button
              v-if="providers?.google"
              :disabled="busy"
              @click="link('google')"
            >
              Привязать Google<AppIcon name="external" :size="15" />
            </button>
          </div>
          <p v-else class="provider-note">
            <AppIcon name="clock" :size="16" /> Дополнительные способы входа
            пока не подключены.
          </p>
          <small
            >Вход через другой сервис без привязки создаст отдельный
            аккаунт.</small
          >
        </section>
      </div>
    </div>
  </section>
</template>
<style scoped lang="scss">
.nickname-form {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 16px;
  label {
    flex: 1;
    min-width: 180px;
  }
}
.account-edit {
  margin: 0 0 16px;
  &:empty {
    display: none;
  }
}
.account {
  max-width: 1280px;
  margin-inline: auto;
}
.page-heading {
  margin-bottom: 48px;
}
.logout {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
  font-size: 14px;
}
.account-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}
.profile {
  padding: 38px 30px 30px;
  text-align: center;
  h2 {
    font-family: "Golos Text", sans-serif;
    font-size: 32px;
    margin: 18px 0 12px;
    overflow-wrap: anywhere;
  }
}
.profile-avatar {
  width: 112px;
  height: 112px;
  border: 3px solid var(--surface-raised);
  box-shadow: 0 0 0 1px var(--line);
  border-radius: 22px;
}
.role {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  color: var(--muted);
  border: 1px solid var(--line);
  padding: 5px 9px;
  border-radius: 6px;
  &.elevated {
    color: var(--warm);
  }
}
.player-link {
  border-top: 1px solid var(--line);
  margin-top: 27px;
  padding-top: 24px;
  > span {
    display: block;
    font-size: 14px;
    color: var(--muted);
    margin-bottom: 9px;
  }
  > svg {
    color: var(--muted);
  }
  a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-decoration: none;
    overflow-wrap: anywhere;
    gap: 8px;
  }
  p {
    font-size: 14px;
    margin: 10px 0 7px;
    line-height: 1.6;
  }
  small {
    font-size: 14px;
    line-height: 1.65;
    display: block;
    color: var(--muted);
  }
}
.admin-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  padding: 11px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  text-decoration: none;
  font-size: 14px;
  &:hover {
    background: var(--surface-raised);
  }
}
.account-details {
  display: grid;
  gap: 24px;
  min-width: 0;
}
.detail-section {
  padding: 32px 36px;
  p {
    font-size: 16px;
    line-height: 1.75;
    color: var(--muted);
    margin: 18px 0;
  }
  > small {
    display: block;
    font-size: 14px;
    color: var(--muted);
    line-height: 1.7;
    margin-top: 18px;
  }
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--accent);
  h2 {
    font-size: 21px;
    color: var(--text);
    margin: 0;
    line-height: 1.6;
  }
}
.permission-list {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 14px;
  }
  svg {
    color: var(--accent);
  }
}
.provider-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  button {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 14px;
  }
}
.provider-note {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  background: var(--bg);
  border-radius: 8px;
  svg {
    flex-shrink: 0;
  }
}
@media (max-width: 760px) {
  .account-layout {
    grid-template-columns: 1fr;
  }
  .profile {
    text-align: left;
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    gap: 8px 18px;
    align-items: center;
    padding: 22px;
    h2 {
      margin: 0;
      font-size: 23px;
    }
    .profile-avatar {
      grid-row: span 2;
      width: 68px;
      height: 68px;
      border-radius: 18px;
    }
    .role {
      justify-self: start;
    }
    .player-link,
    .admin-link {
      grid-column: 1 / -1;
    }
    .player-link {
      margin-top: 12px;
      padding-top: 18px;
    }
    .admin-link {
      margin-top: 10px;
    }
  }
  .detail-section {
    padding: 23px;
  }
}
@media (max-width: 440px) {
  .section-heading h2 {
    font-size: 15px;
  }
  .detail-section {
    padding: 20px;
  }
}
</style>
