export const PERMISSIONS = [
  "levels:write",
  "players:write",
  "districts:write",
  "records:write",
  "news:write",
  "sync:run",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const permissionLabels: Record<Permission, string> = {
  "levels:write": "Уровни",
  "players:write": "Игроки",
  "districts:write": "Районы",
  "records:write": "Рекорды",
  "news:write": "Новости",
  "sync:run": "Синхронизация",
};
export interface Level {
  id: number;
  gdlId: number | null;
  name: string;
  globalRank: number | null;
  localRank: number | null;
  listPercent: number | null;
  endPercent: number | null;
  thresholdName: string | null;
  thresholdSource: string | null;
  verifiedLocal: number;
  creator: string;
  video: string;
  previewImage: string;
  showcaseVideo: string;
  verificationPlayerId: number | null;
  verificationRegion: "spb" | "lo" | null;
  verificationDate: string | null;
  ingameId: number | null;
  length: number | null;
  status: "catalog" | "main" | "extended" | "legacy";
  listExcluded: number;
  manualPosition: number | null;
  gameVersion: string;
  enteredAt: string | null;
  exitedAt: string | null;
  lastMainRank: number | null;
  exitReason: string | null;
}
export interface Player {
  id: number;
  name: string;
  districtId: number | null;
  gdlId: number | null;
  bio: string;
  accountId: number | null;
  avatarUrl: string;
  inactive: number;
}
export interface District {
  id: number;
  name: string;
  region: "spb" | "lo";
}
export interface RecordEntry {
  id: number;
  playerId: number;
  levelId: number;
  manualPercent: number | null;
  importedPercent: number | null;
  importedId: number | null;
  manualVideo: string;
  importedVideo: string;
  active: number;
  reviewNeeded: number;
  missing: number;
  note: string;
  achievedAt: string | null;
  dateSource: "manual" | "video" | null;
  sourceVideo: string;
  deletedAt: string | null;
  updatedAt: string;
}
export interface DistrictExtra {
  id: number;
  districtId: number;
  levelId: number;
  note: string;
  achievedAt: string | null;
}
export interface Account {
  id: number;
  login: string;
  nickname: string;
  passwordHash: string | null;
  headAdmin: number;
  permissions: Permission[];
  disabled: number;
  discordAvatar: string | null;
  googleAvatar: string | null;
  avatarUrl: string;
  createdAt: string;
}
export interface DataSet {
  levels: Level[];
  players: Player[];
  districts: District[];
  records: RecordEntry[];
  extras: DistrictExtra[];
}
export interface RatedResult {
  levelId: number | null;
  name: string;
  percent: number;
  position: number;
  kind: "completion" | "progress" | "empty";
}
export interface Ranking {
  score: number;
  top: RatedResult[];
}
export interface RankedPlayer extends Player, Ranking {
  rank: number;
  districtName: string | null;
  avatar: string | null;
}
export interface RankedDistrict extends District, Ranking {
  rank: number | null;
  playerCount: number;
  completionCount: number;
  legacyCompletionCount: number;
}
