import type {
  DataSet,
  RankedDistrict,
  RankedPlayer,
} from "../../shared/types/domain";
import {
  districtRating,
  effectivePercent,
  playerRating,
} from "../../shared/utils/rating";
import { all, dataset } from "../database";

function rank<T extends { score: number; id: number }>(
  items: T[],
): (T & { rank: number })[] {
  const sorted = items.sort((a, b) => a.score - b.score || a.id - b.id);
  let previous = -1,
    place = 0;
  return sorted.map((entry, i) => {
    if (Math.abs(entry.score - previous) > 1e-9) place = i + 1;
    previous = entry.score;
    return { ...entry, rank: place };
  });
}
export function rankings(data: DataSet = dataset()): {
  players: RankedPlayer[];
  districts: RankedDistrict[];
} {
  const avatars = new Map(
    all<{ id: number; avatar: string | null }>(
      "SELECT id, COALESCE(NULLIF(avatarUrl,''),NULLIF(discordAvatar,''),NULLIF(googleAvatar,'')) AS avatar FROM accounts",
    ).map((a) => [a.id, a.avatar]),
  );
  return {
    players: rank(
      data.players.map((p) => ({
        ...p,
        ...playerRating(data, p.id),
        districtName:
          data.districts.find((d) => d.id === p.districtId)?.name ?? null,
        avatar:
          p.avatarUrl ||
          (p.accountId ? (avatars.get(p.accountId) ?? null) : null),
      })),
    ),
    districts: rank(
      data.districts.map((d) => {
        const players = new Set(
          data.players.filter((p) => p.districtId === d.id).map((p) => p.id),
        );
        const completions = new Set(
          data.records
            .filter(
              (r) => players.has(r.playerId) && effectivePercent(r) === 100,
            )
            .map((r) => r.levelId),
        );
        data.extras
          .filter((e) => e.districtId === d.id)
          .forEach((e) => completions.add(e.levelId));
        return {
          ...d,
          ...districtRating(data, d.id),
          playerCount: players.size,
          completionCount: completions.size,
        };
      }),
    ),
  };
}
