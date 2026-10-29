// @effect-diagnostics globalFetch:off globalDate:off globalConsole:off
/**
 * Zero-Cost YouTube Caption & Web Link Extractor
 * Inspired by DIGI LABS (digiformationltd-creator/digi-labs)
 *
 * Fast, free transcript retrieval directly from YouTube's public Innertube endpoint
 * without SerpApi, YouTube Data API keys, or browser emulators.
 * Also extracts clean, readable text from regular web article URLs.
 */

const YOUTUBE_API_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const YOUTUBE_PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${YOUTUBE_API_KEY}`;

export interface MediaResearchResult {
  ok: boolean;
  isYouTube: boolean;
  videoId?: string | undefined;
  title?: string | undefined;
  transcript: string;
  language?: string | undefined;
  error?: string | undefined;
}

/**
 * Extracts YouTube Video ID from various URL formats:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * - youtube.com/live/VIDEO_ID
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // URL pattern matching
  const urlPatterns = [
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/i,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Decodes standard HTML entities into plain text.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 10));
      } catch {
        return "";
      }
    });
}

/**
 * Parses YouTube timedtext XML and converts it into clean, continuous text.
 */
export function parseCaptionXml(xml: string): string {
  if (!xml || typeof xml !== "string") return "";

  // Captions can be in <p t="..." d="...">...</p> or <text start="..." dur="...">...</text>
  const tagRegex = /<(?:p|text)[^>]*>([\s\S]*?)<\/(?:p|text)>/gi;
  const segments: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xml)) !== null) {
    const rawTag = match[1] || "";
    // Remove nested formatting tags like <s>...</s> or font tags
    const cleanTag = rawTag.replace(/<[^>]+>/g, " ");
    const decoded = decodeHtmlEntities(cleanTag).trim();

    // Remove noise labels like [Music], [Applause], [♪♪♪], ♪
    const filtered = decoded
      .replace(/\[(?:music|applause|cheering|laughter|groan|sigh|music playing|♪+)[^\]]*\]/gi, "")
      .replace(/[♪♩♫♬]/g, "")
      .trim();

    if (filtered) {
      segments.push(filtered);
    }
  }

  // Deduplicate consecutive identical words or lines
  const uniqueSegments: string[] = [];
  for (const seg of segments) {
    if (uniqueSegments[uniqueSegments.length - 1] !== seg) {
      uniqueSegments.push(seg);
    }
  }

  // Join lines and normalize spacing
  return uniqueSegments
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?:;])/g, "$1")
    .trim();
}

/**
 * Fetches transcript for a YouTube video using YouTube's internal Innertube Android player.
 */
export async function fetchYouTubeTranscript(
  videoId: string,
  preferredLanguages: string[] = ["en", "ur", "hi"],
): Promise<{ ok: boolean; title?: string; transcript: string; language?: string; error?: string }> {
  try {
    const res = await fetch(YOUTUBE_PLAYER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US) gzip",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            hl: "en",
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return {
        ok: false,
        transcript: "",
        error: `YouTube player API returned status ${res.status}`,
      };
    }

    const data: any = await res.json();
    const title = data?.videoDetails?.title || `YouTube Video (${videoId})`;

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return {
        ok: false,
        title,
        transcript: "",
        error: "Is YouTube video par captions / transcript dastiyab nahi hai.",
      };
    }

    // Select the best caption track:
    // 1. Try preferred language codes
    // 2. Otherwise pick the first available track
    let selectedTrack = tracks[0];
    for (const lang of preferredLanguages) {
      const match = tracks.find(
        (t: any) =>
          t.languageCode === lang ||
          (t.vssId && t.vssId.includes(`.${lang}`)) ||
          (t.name?.simpleText && t.name.simpleText.toLowerCase().includes(lang)),
      );
      if (match) {
        selectedTrack = match;
        break;
      }
    }

    const captionUrl = selectedTrack?.baseUrl;
    if (!captionUrl) {
      return {
        ok: false,
        title,
        transcript: "",
        error: "Caption track URL nahi mil saka.",
      };
    }

    // Fetch caption XML (with srv3 format for clean structured text)
    const captionFetchUrl = captionUrl.includes("fmt=") ? captionUrl : `${captionUrl}&fmt=srv3`;
    const subRes = await fetch(captionFetchUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!subRes.ok) {
      return {
        ok: false,
        title,
        transcript: "",
        error: `Failed to download caption track (HTTP ${subRes.status})`,
      };
    }

    const xml = await subRes.text();
    const cleanText = parseCaptionXml(xml);

    if (!cleanText) {
      return {
        ok: false,
        title,
        transcript: "",
        error: "Transcript XML khali tha ya decode nahi ho saka.",
      };
    }

    return {
      ok: true,
      title,
      transcript: cleanText,
      language: selectedTrack.languageCode || "en",
    };
  } catch (err: any) {
    return {
      ok: false,
      transcript: "",
      error: err?.message || "YouTube transcript fetch request failed",
    };
  }
}

/**
 * Fetches and cleans text from regular web article URLs.
 */
export async function fetchWebArticleContent(
  url: string,
  maxChars = 10000,
): Promise<{ ok: boolean; title?: string; transcript: string; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return {
        ok: false,
        transcript: "",
        error: `Web page load failed with HTTP status ${res.status}`,
      };
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]!).trim() : "Web Article";

    // Strip non-content tags
    let content = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, " ");

    // Extract text from paragraph & heading tags if possible, otherwise strip all tags
    const paragraphs: string[] = [];
    const pRegex = /<(?:p|h[1-6]|li|blockquote)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li|blockquote)>/gi;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = pRegex.exec(content)) !== null) {
      const pText = decodeHtmlEntities(pMatch[1]!.replace(/<[^>]+>/g, " ")).trim();
      if (pText.length > 25) {
        paragraphs.push(pText);
      }
    }

    let extractedText = "";
    if (paragraphs.length >= 2) {
      extractedText = paragraphs.join("\n\n");
    } else {
      // Fallback: strip all HTML tags
      extractedText = decodeHtmlEntities(content.replace(/<[^>]+>/g, " "));
    }

    // Normalize whitespace
    extractedText = extractedText
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!extractedText || extractedText.length < 30) {
      return {
        ok: false,
        title,
        transcript: "",
        error: "Web page se readable text extract nahi kiya ja saka.",
      };
    }

    if (extractedText.length > maxChars) {
      extractedText = `${extractedText.slice(0, maxChars)}...\n\n[Content truncated for voice summary]`;
    }

    return {
      ok: true,
      title,
      transcript: extractedText,
    };
  } catch (err: any) {
    return {
      ok: false,
      transcript: "",
      error: err?.message || "Web article fetch failed",
    };
  }
}

/**
 * Unified research function that handles both YouTube video links and web articles.
 */
export async function researchMediaLink(url: string, query?: string): Promise<MediaResearchResult> {
  const videoId = extractYouTubeVideoId(url);

  if (videoId) {
    const ytRes = await fetchYouTubeTranscript(videoId);
    return {
      ok: ytRes.ok,
      isYouTube: true,
      videoId,
      title: ytRes.title,
      transcript: ytRes.transcript,
      language: ytRes.language,
      error: ytRes.error,
    };
  }

  // Not a YouTube link -> Web article
  const articleRes = await fetchWebArticleContent(url);
  return {
    ok: articleRes.ok,
    isYouTube: false,
    title: articleRes.title,
    transcript: articleRes.transcript,
    error: articleRes.error,
  };
}
