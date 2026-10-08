import type { DataSet } from "#shared/types/domain";

export type EntityResource =
  | "players"
  | "levels"
  | "districts"
  | "records"
  | "extras"
  | "accounts"
  | "news";

export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "url"
    | "image"
    | "number"
    | "date"
    | "textarea"
    | "checkbox"
    | "select"
    | "permissions";
  required?: boolean;
  nullable?: boolean;
  valueType?: "number";
  options?: { value: string | number; label: string; disabled?: boolean }[];
  help?: string;
  default?: unknown;
  visibleWhen?: { key: string; values: (string | number)[] };
}

export interface EntitySchema {
  fields: Field[];
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  create?: boolean;
}

export interface AdminData extends DataSet {
  accounts: {
    id: number;
    login: string;
    nickname: string;
    displayName: string;
    playerId: number | null;
    playerName: string | null;
    avatarLocked: number;
    headAdmin: number;
    seniorAdmin: number;
    adminContact: string;
    disabled: number;
    permissions: string[];
    avatarUrl: string;
    avatar: string | null;
  }[];
  accountOptions: { id: number; login: string; displayName: string }[];
  syncRuns: {
    id: number;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    summary: string | null;
    error: string | null;
  }[];
  news: { id: number; title: string; createdAt: string }[];
  pendingSync: boolean;
}
