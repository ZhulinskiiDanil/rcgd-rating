export default defineNuxtPlugin(() => {
  const refresh = () => refreshNuxtData("account");
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("spb-account")
      : null;
  channel?.addEventListener("message", refresh);
  window.addEventListener("focus", refresh);
  onNuxtReady(refresh);
});
