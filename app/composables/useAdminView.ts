import type { Permission } from "#shared/types/domain";

export function useAdminView() {
  const viewAsUser = useCookie<boolean>("spb-view-as-user", {
    default: () => false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  const route = useRoute();
  const { data: session } = useNuxtData<{
    user: {
      headAdmin: boolean;
      seniorAdmin?: boolean;
      permissions: Permission[];
    } | null;
  }>("account");
  const showAdminControls = computed(() => {
    const user = session.value?.user;
    return (
      !!user &&
      !!(user.headAdmin || user.seniorAdmin || user.permissions.length) &&
      (!viewAsUser.value || route.path === "/admin")
    );
  });
  return { viewAsUser, showAdminControls };
}
