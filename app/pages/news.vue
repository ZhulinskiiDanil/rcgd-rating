<script setup lang="ts">
const { data, error, refresh } = await useFetch("/api/news");
useHead({ title: "Новости · СПб Demonlist" });
</script>
<template>
  <section>
    <header class="page-heading">
      <h1>Новости</h1>
      <EntityEditButton resource="news" label="Добавить новость" />
    </header>
    <p v-if="error" class="error">
      Не удалось загрузить новости.
      <button @click="refresh()">Повторить</button>
    </p>
    <p v-else-if="!data?.length" class="muted">Новостей пока нет.</p>
    <article v-for="item in data" :key="item.id" class="panel news-item">
      <div>
        <time :datetime="item.createdAt">{{
          new Date(item.createdAt).toLocaleDateString("ru-RU")
        }}</time
        ><EntityEditButton
          resource="news"
          :entity-id="item.id"
          label="Изменить новость"
        />
      </div>
      <p>{{ item.title }}</p>
    </article>
  </section>
</template>
<style scoped lang="scss">
.news-item {
  padding: 24px;
  margin: 20px 0;
  max-width: 960px;
  div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  time {
    color: var(--muted);
  }
  p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin-bottom: 0;
  }
}
</style>
