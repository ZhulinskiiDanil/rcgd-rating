import type { RankedPlayer } from "../types/domain";

export function playerNeighbors(players: RankedPlayer[], playerId: number) {
  const ranked = players
    .filter(
      (player) => !player.hidden && !player.deletedAt && player.rank !== null,
    )
    .toSorted((a, b) => a.rank! - b.rank! || a.id - b.id);
  const index = ranked.findIndex((player) => player.id === playerId);
  return {
    previous: index > 0 ? (ranked[index - 1] ?? null) : null,
    next: index >= 0 ? (ranked[index + 1] ?? null) : null,
  };
}
