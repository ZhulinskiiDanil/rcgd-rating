import { describe, expect, it } from "vitest";
import {
  levelVictors,
  firstLevelVictors,
  regionalFirstVictors,
  type VictorData,
} from "../shared/utils/victors";

const data = (): VictorData => ({
  districts: [
    { id: 1, name: "Центральный", region: "spb" },
    { id: 2, name: "Всеволожский", region: "lo" },
  ],
  players: [
    { id: 1, name: "Alpha", districtId: 1 },
    { id: 2, name: "Beta", districtId: 2 },
    { id: 3, name: "Gamma", districtId: 1 },
    { id: 4, name: "Delta", districtId: null },
  ],
  records: [],
  extras: [],
});
const record = (
  playerId: number,
  achievedAt: string | null,
  percent = 100,
  active = 1,
) => ({
  id: playerId,
  playerId,
  levelId: 7,
  manualPercent: percent,
  importedPercent: null,
  active,
  achievedAt,
  dateSource: null,
  sourceVideo: "",
});

describe("Викторы и даты", () => {
  it("ручной первый виктор имеет приоритет над более ранними датами и сохраняет отметку РК", () => {
    const d = data();
    d.records = [
      record(1, "2024-01-01"),
      { ...record(3, "2025-01-01"), isFirstSpb: 1, isFirstRk: 1 },
    ];
    d.extras = [{ districtId: 1, levelId: 7, achievedAt: "2023-01-01" }];
    const spb = regionalFirstVictors(d, 7).find((row) => row.region === "spb")!;
    expect(spb.manual).toBe(true);
    expect(spb.firstDate).toBe("2025-01-01");
    expect(spb.victors.map((victor) => victor.playerId)).toEqual([3]);
    expect(spb.victors[0]?.isFirstRk).toBe(true);
    d.records[1]!.isFirstSpb = 0;
    expect(
      regionalFirstVictors(d, 7).find((row) => row.region === "spb")?.manual,
    ).toBe(false);
  });
  it("выводит отмеченного первого без даты и не подставляет дату другого игрока", () => {
    const d = data();
    d.records = [
      record(1, "2024-01-01"),
      { ...record(3, null), isFirstSpb: 1 },
    ];
    const spb = regionalFirstVictors(d, 7).find((row) => row.region === "spb")!;
    expect(spb.firstDate).toBeNull();
    expect(spb.victors.map((victor) => victor.playerId)).toEqual([3]);
  });
  it("не переносит ручную отметку первого на чужой регион", () => {
    const d = data();
    d.records = [
      record(1, "2024-01-01"),
      { ...record(2, "2025-01-01"), isFirstSpb: 1 },
    ];
    expect(regionalFirstVictors(d, 7).every((row) => !row.manual)).toBe(true);
    d.records[1]!.isFirstLo = 1;
    expect(
      regionalFirstVictors(d, 7).find((row) => row.region === "lo")?.manual,
    ).toBe(true);
  });
  it("игнорирует ручные отметки на прогрессах, отключённых и удалённых прохождениях", () => {
    for (const ignored of [
      { ...record(3, "2025-01-01", 95), isFirstSpb: 1 },
      { ...record(3, "2025-01-01", 100, 0), isFirstSpb: 1 },
      { ...record(3, "2025-01-01"), isFirstSpb: 1, deletedAt: "2026-10-07" },
    ]) {
      const d = data();
      d.records = [record(1, "2024-01-01"), ignored];
      const spb = regionalFirstVictors(d, 7).find(
        (row) => row.region === "spb",
      )!;
      expect(spb.manual).toBe(false);
      expect(spb.victors.map((victor) => victor.playerId)).toEqual([1]);
    }
  });
  it("показывает единственного регионального виктора без даты, не выдумывая порядок нескольких", () => {
    const d = data();
    d.records = [record(1, null), record(2, null)];
    expect(
      regionalFirstVictors(d, 7).map((row) => row.victors.map((v) => v.name)),
    ).toEqual([["Alpha"], ["Beta"]]);
    d.records.push(record(3, null));
    expect(
      regionalFirstVictors(d, 7).find((row) => row.region === "spb")!.victors,
    ).toEqual([]);
  });
  it("исключает удалённый рекорд из викторов и определения первого даже при active=1", () => {
    const d = data();
    d.records = [
      { ...record(1, "2024-01-01"), deletedAt: "2026-10-06T00:00:00Z" },
      record(3, "2025-01-01"),
    ];
    expect(levelVictors(d, 7).map((victor) => victor.name)).toEqual(["Gamma"]);
    expect(firstLevelVictors(d, 7).firstDate).toBe("2025-01-01");
    expect(
      regionalFirstVictors(d, 7)[0]?.victors.map((victor) => victor.name),
    ).toEqual(["Gamma"]);
  });
  it("показывает единственного известного виктора даже без даты и района", () => {
    const d = data();
    d.records = [record(4, null)];
    const first = firstLevelVictors(d, 7);
    expect(first.victors.map((victor) => victor.name)).toEqual(["Delta"]);
    expect(first.firstDate).toBeNull();
  });
  it("не выбирает первого из нескольких недатированных прохождений", () => {
    const d = data();
    d.records = [record(1, null), record(4, null)];
    const first = firstLevelVictors(d, 7);
    expect(first.victors).toEqual([]);
    expect(first.knownVictors.map((victor) => victor.name)).toEqual([
      "Alpha",
      "Delta",
    ]);
  });
  it("определяет общего первого по датам без обязательной привязки района", () => {
    const d = data();
    d.records = [record(1, "2025-01-01"), record(4, "2024-12-01")];
    expect(
      firstLevelVictors(d, 7).victors.map((victor) => victor.name),
    ).toEqual(["Delta"]);
  });
  it("не присваивает более раннее анонимное прохождение известному игроку", () => {
    const d = data();
    d.records = [record(1, "2025-01-01")];
    d.extras = [{ districtId: 2, levelId: 7, achievedAt: "2024-01-01" }];
    expect(firstLevelVictors(d, 7).victors).toEqual([]);
    expect(firstLevelVictors(d, 7).firstDate).toBe("2024-01-01");
  });
  it("ставит более ранний регион первым, без прогрессов и выключенных рекордов", () => {
    const d = data();
    d.records = [
      record(1, "2025-03-05"),
      record(2, "2025-01-01"),
      record(3, "2024-01-01", 95),
      record(4, "2023-01-01", 100, 0),
    ];
    expect(
      regionalFirstVictors(d, 7).map((row) => [
        row.region,
        row.victors.map((v) => v.name),
      ]),
    ).toEqual([
      ["lo", ["Beta"]],
      ["spb", ["Alpha"]],
    ]);
  });
  it("не выбирает произвольного победителя при совпадающей дате", () => {
    const d = data();
    d.records = [record(3, "2025-01-01"), record(1, "2025-01-01")];
    expect(regionalFirstVictors(d, 7)[0]?.victors.map((v) => v.name)).toEqual([
      "Alpha",
      "Gamma",
    ]);
  });
  it("не объявляет первого, когда все даты неизвестны", () => {
    const d = data();
    d.records = [record(1, null), record(3, "2025-02-30")];
    const region = regionalFirstVictors(d, 7)[0]!;
    expect(region.firstDate).toBeNull();
    expect(region.victors).toEqual([]);
    expect(region.hasUndated).toBe(true);
    expect(region.hasCompletions).toBe(true);
  });
  it("отмечает неопределённость при наличии прохождений без даты", () => {
    const d = data();
    d.records = [record(1, "2025-01-01"), record(3, null)];
    expect(regionalFirstVictors(d, 7)[0]?.hasUndated).toBe(true);
    expect(levelVictors(d, 7).map((v) => v.name)).toEqual(["Alpha", "Gamma"]);
  });
  it("не приписывает анонимный более ранний рекорд известному игроку", () => {
    const d = data();
    d.records = [record(1, "2025-03-01")];
    d.extras = [{ districtId: 1, levelId: 7, achievedAt: "2025-01-01" }];
    const region = regionalFirstVictors(d, 7)[0]!;
    expect(region.firstDate).toBe("2025-01-01");
    expect(region.victors).toEqual([]);
  });
  it("районный список сортируется по датам и исключает игроков другого района", () => {
    const d = data();
    d.records = [
      record(1, "2025-02-01"),
      record(2, "2025-01-01"),
      record(3, "2025-01-01"),
    ];
    expect(levelVictors(d, 7, 1).map((v) => v.name)).toEqual([
      "Gamma",
      "Alpha",
    ]);
  });
  it("не выводит неприкреплённых к району игроков как первых в регионе", () => {
    const d = data();
    d.records = [record(4, "2024-01-01")];
    expect(regionalFirstVictors(d, 7).every((row) => !row.hasCompletions)).toBe(
      true,
    );
    expect(levelVictors(d, 7)).toHaveLength(1);
  });
});
