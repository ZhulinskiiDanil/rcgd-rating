export function videoEmbed(
  value: string,
): { kind: "iframe" | "video"; url: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol)) return null;
  const host = url.hostname.replace(/^www\./, "");
  const id =
    host === "youtu.be"
      ? url.pathname.split("/")[1]
      : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
        ? url.searchParams.get("v") ||
          url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
        : null;
  if (id && /^[\w-]{11}$/.test(id))
    return {
      kind: "iframe",
      url: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const id = url.pathname.match(/\/(\d+)$/)?.[1];
    if (id)
      return { kind: "iframe", url: `https://player.vimeo.com/video/${id}` };
  }
  if (/\.(mp4|webm|ogv)$/i.test(url.pathname))
    return { kind: "video", url: url.href };
  return null;
}
