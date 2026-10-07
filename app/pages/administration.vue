<script setup lang="ts">
const { data, error, refresh } = await useFetch("/api/administration");
useHead({ title: "Администрация · СПб Demonlist" });
</script>
<template>
  <section>
    <h1>Администрация</h1>
    <p v-if="error" class="error">
      Не удалось загрузить список. <button @click="refresh()">Повторить</button>
    </p>
    <div class="staff">
      <component
        :is="member.playerId ? resolveComponent('NuxtLink') : 'div'"
        v-for="member in data"
        :key="member.id"
        :to="member.playerId ? `/players/${member.playerId}` : undefined"
        class="panel member"
        ><UserAvatar :name="member.name" :url="member.avatar" />
        <div>
          <strong>{{ member.name }}</strong
          ><span>{{
            member.headAdmin ? "Главный администратор" : "Администратор"
          }}</span>
        </div></component
      >
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
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 24px;
  span {
    display: block;
    color: var(--muted);
    font-size: 14px;
  }
  strong {
    overflow-wrap: anywhere;
  }
}
</style>
