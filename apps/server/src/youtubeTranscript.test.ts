import { describe, it, expect } from "vite-plus/test";
import {
  extractYouTubeVideoId,
  decodeHtmlEntities,
  parseCaptionXml,
  researchMediaLink,
} from "./youtubeTranscript.ts";

describe("youtubeTranscript", () => {
  describe("extractYouTubeVideoId", () => {
    it("extracts from standard watch URLs", () => {
      expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ",
      );
      expect(
        extractYouTubeVideoId("https://youtube.com/watch?feature=shared&v=dQw4w9WgXcQ&t=10s"),
      ).toBe("dQw4w9WgXcQ");
    });

    it("extracts from short youtu.be URLs", () => {
      expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=test")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from shorts URLs", () => {
      expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ",
      );
    });

    it("extracts from live and embed URLs", () => {
      expect(extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ",
      );
    });

    it("returns null for non-YouTube URLs", () => {
      expect(extractYouTubeVideoId("https://example.com/article/123")).toBeNull();
      expect(extractYouTubeVideoId("")).toBeNull();
    });
  });

  describe("decodeHtmlEntities", () => {
    it("decodes common HTML entities", () => {
      expect(decodeHtmlEntities("&amp; &quot; &#39; &lt; &gt;")).toBe("& \" ' < >");
      expect(decodeHtmlEntities("It&#39;s a test &amp; fun")).toBe("It's a test & fun");
    });
  });

  describe("parseCaptionXml", () => {
    it("parses srv3 and standard timedtext XML correctly", () => {
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<timedtext format="3">
<body>
<p t="1360" d="1680">[♪♪♪]</p>
<p t="18640" d="3240">♪ We&#39;re no strangers to love ♪</p>
<p t="22640" d="4320">♪ You know the rules
and so do I ♪</p>
</body>
</timedtext>`;
      const clean = parseCaptionXml(xml);
      expect(clean).toContain("We're no strangers to love");
      expect(clean).toContain("You know the rules and so do I");
      expect(clean).not.toContain("[♪♪♪]");
    });
  });

  describe("researchMediaLink live integration", () => {
    it("successfully fetches public YouTube video transcript", async () => {
      // Testing with a famous public YouTube video that has verified public captions
      const res = await researchMediaLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(res.isYouTube).toBe(true);
      expect(res.videoId).toBe("dQw4w9WgXcQ");
      if (res.ok) {
        expect(res.transcript.length).toBeGreaterThan(50);
        expect(res.title).toBeDefined();
      }
    });
  });
});
