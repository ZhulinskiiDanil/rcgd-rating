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
  listTier,
  completedLevels,
} from "../../shared/utils/rating";
import { all, dataset } from "../database";

export function rankings(data: DataSet = dataset()): {
  players: RankedPlayer[];
  districts: RankedDistrict[];
} {
  const accounts = new Map(
    all<{
      id: number;
      avatar: string | null;
      headAdmin: number;
      permissions: string;
      disabled: number;
    }>(
      "SELECT id,headAdmin,permissions,disabled, COALESCE(NULLIF(avatarUrl,''),NULLIF(discordAvatar,''),NULLIF(googleAvatar,'')) AS avatar FROM accounts",
    ).map((a) => [a.id, a]),
  );
  data = {
    ...data,
    players: data.players.filter((p) => !p.deletedAt),
    extras: data.extras.filter((e) => !e.deletedAt),
  };
  const completed = completedLevels(data);
  const levelTiers = new Map(
    data.levels.map((level) => [level.id, listTier(level)]),
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
    const counts = { main: 0, extended: 0, legacy: 0 };
    for (const levelId of completions) {
      const tier = levelTiers.get(levelId);
      if (tier) counts[tier] += 1;
    }
    return {
      ...district,
      ...districtRating(data, district.id, completed),
      playerCount: players.size,
      completionCount: counts.main + counts.extended,
      mainCompletionCount: counts.main,
      extendedCompletionCount: counts.extended,
      legacyCompletionCount: counts.legacy,
    };
  });
  const districtRanks = new Map(
    rankEntries(
      districts.filter((district) => district.completionCount > 0),
    ).map((district) => [district.id, district.rank]),
  );
  const players = data.players.map((p) => {
    const account = p.accountId ? accounts.get(p.accountId) : undefined;
    return {
      ...p,
      ...playerRating(data, p.id, completed),
      districtName:
        data.districts.find((d) => d.id === p.districtId)?.name ?? null,
      avatar: p.avatarUrl || account?.avatar || null,
      role:
        account && !account.disabled
          ? account.headAdmin
            ? ("head-admin" as const)
            : JSON.parse(account.permissions).length
              ? ("admin" as const)
              : null
          : null,
    };
  });
  const playerRanks = new Map(
    rankEntries(players.filter((p) => !p.hidden)).map((p) => [p.id, p.rank]),
  );
  return {
    players: players
      .map((p) => ({ ...p, rank: playerRanks.get(p.id) ?? null }))
      .sort(
        (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.id - b.id,
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
