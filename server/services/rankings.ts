import type {
  DataSet,
  RankedDistrict,
  RankedPlayer,
} from "../../shared/types/domain";
import {
  districtRating,
  effectivePercent,
  playerRating,
  rankEntries,
  isCurrentLevel,
  listTier,
} from "../../shared/utils/rating";
import { all, dataset } from "../database";

export function rankings(data: DataSet = dataset()): {
  players: RankedPlayer[];
  districts: RankedDistrict[];
} {
  const avatars = new Map(
    all<{ id: number; avatar: string | null }>(
      "SELECT id, COALESCE(NULLIF(avatarUrl,''),NULLIF(discordAvatar,''),NULLIF(googleAvatar,'')) AS avatar FROM accounts",
    ).map((a) => [a.id, a.avatar]),
  );
  const currentLevels = new Set(
    data.levels.filter(isCurrentLevel).map((level) => level.id),
  );
  const legacyLevels = new Set(
    data.levels
      .filter((level) => listTier(level) === "legacy")
      .map((level) => level.id),
  );
  const districts = data.districts.map((district) => {
    const players = new Set(
      data.players
        .filter((player) => player.districtId === district.id)
        .map((player) => player.id),
    );
    const completions = new Set(
      data.records
        .filter(
          (record) =>
            players.has(record.playerId) && effectivePercent(record) === 100,
        )
        .map((record) => record.levelId),
    );
    data.extras
      .filter((extra) => extra.districtId === district.id)
      .forEach((extra) => completions.add(extra.levelId));
    return {
      ...district,
      ...districtRating(data, district.id),
      playerCount: players.size,
      completionCount: [...completions].filter((id) => currentLevels.has(id))
        .length,
      legacyCompletionCount: [...completions].filter((id) =>
        legacyLevels.has(id),
      ).length,
    };
  });
  const districtRanks = new Map(
    rankEntries(
      districts.filter((district) => district.completionCount > 0),
    ).map((district) => [district.id, district.rank]),
  );
  return {
    players: rankEntries(
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
    districts: districts
      .map((district) => ({
        ...district,
        rank: districtRanks.get(district.id) ?? null,
      }))
      .sort(
        (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.id - b.id,
      ),
  };
}
