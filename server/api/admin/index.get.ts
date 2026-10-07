import { all, dataset, one } from "../../database";
import { PERMISSIONS } from "../../../shared/types/domain";
export default defineEventHandler(async (event) => {
  const user = await requireAccount(event);
  if (!user.headAdmin && !user.permissions.length)
    throw createError({ statusCode: 403, message: "Нет доступа к админке" });
  const can = (p: (typeof PERMISSIONS)[number]) =>
    !!user.headAdmin || user.permissions.includes(p);
  const requestedNewsId = Number(getQuery(event).newsId);
  const newsId =
    Number.isSafeInteger(requestedNewsId) && requestedNewsId > 0
      ? requestedNewsId
      : null;
  const data = dataset();
  return {
    ...data,

    accounts: user.headAdmin
      ? all<{
          id: number;
          login: string;
          nickname: string;
          displayName: string;
          avatarLocked: number;
          headAdmin: number;
          disabled: number;
          permissions: string;
          avatarUrl: string;
          avatar: string | null;
        }>(
          "SELECT a.id,a.login,a.nickname,COALESCE(NULLIF(p.name,''),NULLIF(a.nickname,''),a.login) AS displayName,a.headAdmin,a.disabled,a.permissions,a.avatarLocked,a.avatarUrl,COALESCE(NULLIF(a.avatarUrl,''),NULLIF(a.discordAvatar,''),NULLIF(a.googleAvatar,'')) AS avatar FROM accounts a LEFT JOIN players p ON p.accountId=a.id AND p.deletedAt IS NULL",
        ).map((a) => ({
          ...a,
          permissions: JSON.parse(a.permissions) as string[],
        }))
      : [],
    accountOptions: can("players:write")
      ? all<{ id: number; login: string; displayName: string }>(
          "SELECT a.id,a.login,COALESCE(NULLIF(p.name,''),NULLIF(a.nickname,''),a.login) AS displayName FROM accounts a LEFT JOIN players p ON p.accountId=a.id AND p.deletedAt IS NULL",
        )
      : [],
    syncRuns: can("sync:run")
      ? all<{
          id: number;
          status: string;
          startedAt: string;
          finishedAt: string | null;
          summary: string | null;
          error: string | null;
        }>("SELECT * FROM syncRuns ORDER BY id DESC LIMIT 20")
      : [],
    news: can("news:write")
      ? all<{ id: number; title: string; createdAt: string }>(
          `SELECT id,title,createdAt FROM changes WHERE kind='news' ${newsId ? "AND id=?" : ""} ORDER BY id DESC LIMIT 100`,
          ...(newsId ? [newsId] : []),
        )
      : [],
    pendingSync: !!one(
      "SELECT key FROM settings WHERE key='syncLock' AND CAST(value AS INTEGER)>?",
      Date.now(),
    ),
  };
});
