import type { Account } from "../../shared/types/domain";

export interface AccountSession {
  user?: { id: number };
  secure?: { accountKey?: string };
}

export function sessionMatchesAccount(
  session: AccountSession,
  account: Pick<Account, "id" | "sessionKey" | "disabled"> | undefined,
) {
  return !!(
    account &&
    !account.disabled &&
    session.user?.id === account.id &&
    account.sessionKey &&
    session.secure?.accountKey === account.sessionKey
  );
}
