import { expect, it } from "vitest";
import { videoEmbed } from "../shared/utils/video-embed";
it("embeds recognized hosts and keeps untrusted URLs out of iframe markup", () => {
  expect(videoEmbed("https://youtu.be/abcdefghijk?t=20")).toEqual({
    kind: "iframe",
    url: "https://www.youtube-nocookie.com/embed/abcdefghijk",
  });
  expect(videoEmbed("https://youtube.com/shorts/abcdefghijk")).toEqual(
    videoEmbed("https://youtu.be/abcdefghijk"),
  );
  expect(videoEmbed("https://vimeo.com/12345")?.url).toBe(
    "https://player.vimeo.com/video/12345",
  );
  expect(videoEmbed("https://example.com/video.mp4")?.kind).toBe("video");
  expect(
    videoEmbed("https://youtube.com.evil.example/embed/abcdefghijk"),
  ).toBeNull();
  expect(videoEmbed("javascript:alert(1)")).toBeNull();
  expect(videoEmbed("https://example.com/page")).toBeNull();
});
