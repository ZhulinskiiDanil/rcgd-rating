<script setup lang="ts">
const { data, error, refresh } = await useFetch("/api/administration");
const profileLink = resolveComponent("NuxtLink");
const contactLink = (contact: string) =>
  /^https?:\/\/\S+$/i.test(contact.trim()) ? contact.trim() : undefined;
useHead({ title: "Администрация · СПб Demonlist" });
</script>
<template>
  <section>
    <h1>Администрация</h1>
    <p v-if="error" class="error">
      Не удалось загрузить список. <button @click="refresh()">Повторить</button>
    </p>
    <div class="staff">
      <article v-for="member in data" :key="member.id" class="panel member">
        <component
          :is="member.playerId ? profileLink : 'div'"
          :to="member.playerId ? `/players/${member.playerId}` : undefined"
          class="member-profile"
          ><UserAvatar
            class="staff-avatar"
            :name="member.name"
            :url="member.avatar"
          />
          <div>
            <strong>{{ member.name }}</strong>
            <span
              class="role-label"
              :class="{
                'head-admin': member.headAdmin,
                'senior-admin': !member.headAdmin && member.seniorAdmin,
              }"
              >{{
                member.headAdmin
                  ? "Главный администратор"
                  : member.seniorAdmin
                    ? "Старший администратор"
                    : "Администратор"
              }}</span
            >
          </div>
        </component>
        <p v-if="member.adminContact" class="member-contact">
          <a
            v-if="contactLink(member.adminContact)"
            :href="contactLink(member.adminContact)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ member.adminContact }}</a
          ><span v-else>{{ member.adminContact }}</span>
        </p>
      </article>
    </div>
  </section>
</template>
<style scoped lang="scss">
.staff {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  margin-top: 28px;
}
.member {
  padding: 24px;
}
.member-profile {
  display: flex;
  gap: 16px;
  align-items: center;
  color: var(--text);
  text-decoration: none;
  strong {
    overflow-wrap: anywhere;
  }
  > div {
    min-width: 0;
  }
}
.role-label {
  display: block;
  margin-top: 6px;
  color: var(--accent);
  font-size: 14px;
  &.head-admin {
    color: var(--warm);
  }
  &.senior-admin {
    color: var(--success);
  }
}
.member-contact {
  margin: 14px 0 0 73.6px;
  font-size: 14px;
  overflow-wrap: anywhere;
  color: var(--muted);
}
.member .staff-avatar {
  width: 57.6px;
  height: 57.6px;
}
</style>
