import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertGlobalSnapshotSize,
  fetchLevels,
} from "../server/services/sources";

const rows = Array.from({ length: 1003 }, (_, index) => ({
  id: index + 1,
  name: `Level ${index + 1}`,
  placement: index + 1,
}));
const response = (levels: typeof rows) =>
  new Response(JSON.stringify({ message: "success", data: { levels } }));
const offsetOf = (url: string) =>
  Number(new URL(url).searchParams.get("offset"));

afterEach(() => vi.unstubAllGlobals());

describe("Полнота пагинации глобального списка", () => {
  it("отклоняет потерю более50 записей и более10% предыдущего списка", () => {
    expect(() => assertGlobalSnapshotSize(1839, 1500)).toThrow(
      "было 1839, получено 1500, отсутствует 339",
    );
    expect(() => assertGlobalSnapshotSize(500, 449)).toThrow();
  });

  it.each([
    [1839, 1837],
    [500, 450],
    [1000, 900],
    [200, 150],
    [0, 1837],
    [1837, 1840],
  ])(
    "принимает изменение размера %i → %i в пределах защиты",
    (before, after) => {
      expect(() => assertGlobalSnapshotSize(before, after)).not.toThrow();
    },
  );

  it("принимает удалённую позицию, сохраняя исходные номера и весь хвост", async () => {
    const source = rows.filter((level) => level.placement !== 79);
    const fetcher = vi.fn(async (url: string) => {
      const offset = offsetOf(url);
      return response(source.slice(offset, offset + 500));
    });
    vi.stubGlobal("fetch", fetcher);
    const levels = await fetchLevels();
    expect(levels).toEqual(source);
    expect(levels[78]?.placement).toBe(80);
    expect(levels.at(-1)?.placement).toBe(1003);
    expect(fetcher.mock.calls.map(([url]) => offsetOf(url))).toEqual([
      0, 500, 1000, 1002, 0,
    ]);
  });

  it("не считает короткую промежуточную страницу концом списка", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const offset = offsetOf(url);
      return response(rows.slice(offset, offset + (offset === 500 ? 7 : 500)));
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchLevels()).toEqual(rows);
    expect(fetcher.mock.calls.map(([url]) => offsetOf(url))).toEqual([
      0, 500, 507, 1003, 0,
    ]);
  });

  it("отклоняет повторившуюся страницу вместо потери оставшихся уровней", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(rows.slice(0, 500))),
    );
    await expect(fetchLevels()).rejects.toThrow("повторяющийся");
  });

  it.each([
    ["повтор позиций", 500],
    ["изменённый порядок", 499],
  ])("отклоняет %s между страницами", async (_, placement) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const offset = offsetOf(url);
        const page = rows
          .slice(offset, offset + 500)
          .map((level) => ({ ...level }));
        if (offset === 500) page[0]!.placement = placement;
        return response(page);
      }),
    );
    await expect(fetchLevels()).rejects.toThrow("порядок");
  });

  it("отклоняет ошибку источника при проверке конца списка", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        offsetOf(url) === rows.length
          ? new Response("Unavailable", { status: 503 })
          : response(rows.slice(offsetOf(url), offsetOf(url) + 500)),
      ),
    );
    await expect(fetchLevels()).rejects.toThrow("503");
  });

  it("отклоняет изменившуюся первую страницу после полной выгрузки", async () => {
    let firstReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const offset = offsetOf(url);
        const page = rows
          .slice(offset, offset + 500)
          .map((level) => ({ ...level }));
        if (offset === 0 && ++firstReads > 1) page[0]!.id = 2000;
        return response(page);
      }),
    );
    await expect(fetchLevels()).rejects.toThrow("изменился во время чтения");
  });

  it("отклоняет пустую или слишком маленькую полную выгрузку", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        response(rows.slice(0, 149).slice(offsetOf(url))),
      ),
    );
    await expect(fetchLevels()).rejects.toThrow("Неполный");
  });
});
