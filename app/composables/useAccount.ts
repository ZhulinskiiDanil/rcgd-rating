export const useAccount = () => {
  const requestFetch = useRequestFetch();
  return useAsyncData("account", async () => ({
    user: (await requestFetch("/api/auth/me")) ?? null,
  }));
};
