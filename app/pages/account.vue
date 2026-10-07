<script setup lang="ts">
const { data: session } = await useAccount();
const route = useRoute();
const destination = computed(() =>
  session.value?.user?.playerId
    ? `/players/${session.value.user.playerId}`
    : "/account/settings",
);
if (!session.value?.user) await navigateTo("/login");
else if (route.path === "/account")
  await navigateTo(destination.value, { replace: true });
watch(
  () => route.path,
  (path) => {
    if (path === "/account")
      void navigateTo(destination.value, { replace: true });
  },
);
</script>
<template><NuxtPage /></template>
