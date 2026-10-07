export function districtGenitive(name: string) {
  return name
    .split(" ")
    .map((word) => {
      if (word === "округ") return "округа";
      if (word === "район") return "района";
      return word.replace(
        /(?:ск[ио]й|ный|вый)$/u,
        (ending) => `${ending.slice(0, -2)}ого`,
      );
    })
    .join(" ");
}

export function formatDistrictHistory(title: string, names: string[]) {
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const neighbor = new RegExp(
      `(^|\\s)((?:выше|ниже)\\s+)${escaped}(?=\\s*(?:$|[.,;:!?()]|и\\s+(?:выше|ниже)\\s))`,
      "gu",
    );
    title = title.replace(
      neighbor,
      (_match, before: string, comparison: string) =>
        `${before}${comparison}${districtGenitive(name)}`,
    );
  }
  return title;
}
