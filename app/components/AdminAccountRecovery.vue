<script setup lang="ts">
const props = defineProps<{
  accounts: { id: number; login: string; displayName: string }[];
}>();
const { data: session } = await useAccount();
const accountId = ref<number | "">("");
const busy = ref(false);
const accounts = computed(() =>
  props.accounts.filter((account) => account.id !== session.value?.user?.id),
);
</script>

<template>
  <section class="admin-account-recovery">
    <label>
      Аккаунт для восстановления
      <select v-model="accountId" :disabled="busy || !accounts.length">
        <option value="">Выбери аккаунт</option>
        <option
          v-for="account in accounts"
          :key="account.id"
          :value="account.id"
        >
          {{ account.displayName || account.login }} · {{ account.login }}
        </option>
      </select>
    </label>
    <AccountPasswordReset
      v-if="
        accountId !== '' && accounts.some((account) => account.id === accountId)
      "
      :key="accountId"
      :account-id="accountId"
      @busy="busy = $event"
    />
    <p v-if="!accounts.length" class="muted">
      Нет аккаунтов для восстановления.
    </p>
  </section>
</template>

<style scoped lang="scss">
.admin-account-recovery {
  max-width: 680px;
  > label {
    max-width: 420px;
  }
  select {
    width: 100%;
  }
}
</style>
