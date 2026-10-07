import { dataset } from "../../database";
import { rankings } from "../../services/rankings";
import { effectivePercent, listTier } from "../../../shared/utils/rating";
import { recordVideoUrl } from "../../../shared/utils/record-video";
import { levelVictors } from "../../../shared/utils/victors";

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
              : `${r.name}${r.kind === "progress" ? ` ${r.percent}%` : ""} (#${r.position})`,
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
  else throw createError({ statusCode: 404 });
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
