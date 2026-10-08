import type { Permission } from "#shared/types/domain";
import type { EntityResource } from "../types/admin";

export interface EditRequest {
  resource: EntityResource;
  entityId?: number;
  defaults?: Record<string, unknown>;
  title: string;
}
const permissions: Record<EntityResource, Permission | null> = {
  levels: "levels:write",
  players: "players:write",
  records: "records:write",
  districts: "districts:write",
  extras: "districts:write",
  news: "news:write",
  accounts: null,
};
export function useEntityEditor() {
  const { showAdminControls } = useAdminView();
  const target = useState<EditRequest | null>("entity-editor", () => null);
  const notice = useState<string>("entity-editor-notice", () => "");
  const { data: session } = useNuxtData<{
    user: { headAdmin: boolean; permissions: Permission[] } | null;
  }>("account");
  const canEdit = (resource: EntityResource) => {
    const user = session.value?.user;
    const permission = permissions[resource];
    return (
      !!user &&
      showAdminControls.value &&
      (user.headAdmin ||
        (!!permission && user.permissions.includes(permission)))
    );
  };
  function open(request: EditRequest) {
    if (!canEdit(request.resource)) return;
    notice.value = "";
    target.value = request;
  }
  return { target, notice, canEdit, open };
}
