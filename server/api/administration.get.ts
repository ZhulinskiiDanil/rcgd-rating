import { all } from "../database";
export default defineEventHandler(() =>
  all<{
    id: number;
    name: string;
    avatar: string | null;
    playerId: number | null;
    headAdmin: number;
  }>(
    `SELECT a.id,COALESCE(NULLIF(p.name,''),NULLIF(a.nickname,''),a.login) AS name,COALESCE(NULLIF(p.avatarUrl,''),NULLIF(a.avatarUrl,''),NULLIF(a.discordAvatar,''),NULLIF(a.googleAvatar,'')) AS avatar,p.id AS playerId,a.headAdmin FROM accounts a LEFT JOIN players p ON p.accountId=a.id AND p.deletedAt IS NULL WHERE a.disabled=0 AND (a.headAdmin=1 OR json_array_length(a.permissions)>0) ORDER BY a.headAdmin DESC,a.id`,
  ),
);
