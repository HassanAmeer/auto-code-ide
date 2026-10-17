import type { PreviewAnnotationPayload } from "@t3tools/contracts";

import { dataUrlToFile } from "./imageCompression";

export type PreviewAnnotationCapture =
  /** The crop is ready to attach. */
  | { readonly status: "captured"; readonly file: File }
  /** The pick carried no crop, which is normal for comment-only annotations. */
  | { readonly status: "none" }
  /** The crop could not be decoded. Send the annotation without it. */
  | { readonly status: "failed" };

const DATA_URL_REGEX = /^data:(image\/[a-zA-Z0-9.+_-]+);base64,/i;

/** Decode crop locally; fetching a data URL violates connect-src. Supports PNG, JPEG, WEBP. */
export function capturePreviewAnnotationScreenshot(
  annotation: PreviewAnnotationPayload,
): PreviewAnnotationCapture {
  if (!annotation.screenshot) return { status: "none" };
  try {
    const { dataUrl } = annotation.screenshot;
    const match = dataUrl.match(DATA_URL_REGEX);
    if (!match) {
      return { status: "failed" };
    }
    const mimeType = match[1] || "image/png";
    const extension =
      mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const file = dataUrlToFile(
      dataUrl,
      `preview-annotation-${annotation.id}.${extension}`,
      mimeType,
    );
    return file.size > 0 ? { status: "captured", file } : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
