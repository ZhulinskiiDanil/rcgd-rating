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
  options?: { value: string | number; label: string }[];
  help?: string;
  default?: unknown;
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
    headAdmin: number;
    disabled: number;
    permissions: string[];
    avatarUrl: string;
    avatar: string | null;
  }[];
  accountOptions: { id: number; login: string }[];
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
