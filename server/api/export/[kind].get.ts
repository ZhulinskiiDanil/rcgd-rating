import { all, dataset } from "../../database";
import { rankings } from "../../services/rankings";
import {
  effectivePercent,
  hasLevelPage,
  listTier,
} from "../../../shared/utils/rating";
import { recordVideoUrl } from "../../../shared/utils/record-video";
import { levelVictors } from "../../../shared/utils/victors";
import { formatPosition } from "../../../shared/utils/presentation";
import { withoutHistoryQuotes } from "../../services/list-events";

export default defineEventHandler((event) => {
  const kind = (getRouterParam(event, "kind") || "").replace(/\.csv$/, "");
  const data = dataset(),
    rating = rankings(data);
  let rows: (string | number | null)[][];
  if (kind === "levels")
    rows = [
      [
        "Место СПб",
        "Уровень",
        "Автор",
        "Место Global Demonlist",
        "Раздел",
        "t",
        "T",
        "Викторы",
        "Дата вылета",
      ],
      ...data.levels
        .filter((l) => listTier(l))
        .sort(
          (a, b) =>
            (a.localRank ?? Infinity) - (b.localRank ?? Infinity) ||
            (b.exitedAt ?? "").localeCompare(a.exitedAt ?? ""),
        )
        .map((l) => [
          l.localRank,
          l.name,
          l.creator,
          l.globalRank,
          listTier(l),
          l.listPercent,
          l.endPercent,
          levelVictors(data, l.id)
            .map((v) => v.name)
            .join(", "),
          l.exitedAt?.slice(0, 10) ?? null,
        ]),
    ];
  else if (kind === "players")
    rows = [
      [
        "Место",
        "Игрок",
        "Район",
        "Очки",
        "1 хардест",
        "2 хардест",
        "3 хардест",
        "4 хардест",
        "5 хардест",
        "6 хардест",
      ],
      ...rating.players
        .filter((p) => !p.hidden)
        .map((p) => [
          p.rank,
          p.name,
          p.districtName,
          p.score,
          ...p.top.map((r) =>
            r.kind === "empty"
              ? ""
              : `${r.name}${r.kind === "progress" ? ` ${r.percent}%` : ""} (#${formatPosition(r.position)})`,
          ),
        ]),
    ];
  else if (kind === "districts")
    rows = [
      ["Место", "Район", "Регион", "Очки", "Игроки", "Прохождения"],
      ...rating.districts.map((d) => [
        d.rank,
        d.name,
        d.region === "spb" ? "Санкт-Петербург" : "Ленинградская область",
        d.score,
        d.playerCount,
        d.completionCount,
      ]),
    ];
  else if (kind === "records")
    rows = [
      ["Игрок", "Уровень", "Результат, %", "Дата", "Видео", "Первый РК виктор"],
      ...data.records
        .filter(
          (r) =>
            effectivePercent(r) > 0 &&
            !data.players.find((p) => p.id === r.playerId)?.deletedAt &&
            !data.levels.find((l) => l.id === r.levelId)?.deletedAt,
        )
        .map((r) => [
          data.players.find((p) => p.id === r.playerId)?.name ?? "",
          data.levels.find((l) => l.id === r.levelId)?.name ?? "",
          effectivePercent(r),
          r.achievedAt,
          recordVideoUrl(r),
          r.isFirstRk ? "Да" : "",
        ]),
    ];
  else if (kind === "history") {
    const origin = process.env.APP_ORIGIN || getRequestURL(event).origin;
    const labels: Record<string, string> = {
      level: "Уровни",
      "player-rating": "Рейтинг игроков",
      "district-rating": "Рейтинг районов",
    };
    const date = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    rows = [
      ["Дата (МСК)", "Тип", "Событие", "Ссылка"],
      ...all<{
        kind: string;
        entityId: number | null;
        title: string;
        createdAt: string;
      }>(
        "SELECT kind,entityId,title,createdAt FROM changes WHERE public=1 AND deletedAt IS NULL AND kind IN ('level','player-rating','district-rating') ORDER BY createdAt DESC,id DESC",
      ).map((entry) => {
        let path = "/changelog";
        if (
          entry.kind === "level" &&
          data.levels.some(
            (level) => level.id === entry.entityId && hasLevelPage(level),
          )
        )
          path = `/levels/${entry.entityId}`;
        else if (
          entry.kind === "player-rating" &&
          rating.players.some(
            (player) => player.id === entry.entityId && !player.hidden,
          )
        )
          path = `/players/${entry.entityId}`;
        else if (
          entry.kind === "district-rating" &&
          rating.districts.some(
            (district) =>
              district.id === entry.entityId &&
              (district.completionCount || district.legacyCompletionCount),
          )
        )
          path = `/districts/${entry.entityId}`;
        return [
          date.format(new Date(entry.createdAt)),
          labels[entry.kind]!,
          withoutHistoryQuotes(entry.title),
          new URL(path, origin).href,
        ];
      }),
    ];
  } else throw createError({ statusCode: 404 });
  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "public, max-age=60",
  });
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let value = String(cell ?? "");
          if (typeof cell === "string" && /^[=+@\-\t\r\n]/.test(value))
            value = "'" + value;
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
});
