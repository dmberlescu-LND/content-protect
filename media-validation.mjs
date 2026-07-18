import sharp from "sharp";

const IMAGE_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tiff: "image/tiff",
  avif: "image/avif",
  heif: "image/heic",
};

export class MediaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MediaValidationError";
  }
}

function videoType(buffer) {
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    const brand = buffer.subarray(8, 12).toString("ascii");
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  )
    return "video/webm";
  return null;
}

export async function inspectMedia(buffer, declaredMime = "") {
  if (!Buffer.isBuffer(buffer) || !buffer.length)
    throw new MediaValidationError("The media file is empty.");
  const declared = String(declaredMime).toLowerCase();
  if (declared === "image/svg+xml")
    throw new MediaValidationError("SVG files are not accepted as reference media.");

  if (declared.startsWith("image/")) {
    let metadata;
    try {
      metadata = await sharp(buffer, {
        failOn: "warning",
        limitInputPixels: 40_000_000,
        animated: false,
      }).metadata();
    } catch {
      throw new MediaValidationError(
        "The image is corrupt, disguised, unsupported or exceeds 40 megapixels.",
      );
    }
    const mime = IMAGE_MIME[metadata.format];
    if (!mime || !metadata.width || !metadata.height)
      throw new MediaValidationError("The image format is not supported.");
    if (metadata.width < 16 || metadata.height < 16)
      throw new MediaValidationError("The reference image is too small.");
    return {
      kind: "image",
      mime,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      pages: metadata.pages || 1,
      declaredMime: declared,
    };
  }

  if (declared.startsWith("video/")) {
    const mime = videoType(buffer);
    if (!mime)
      throw new MediaValidationError(
        "Only genuine MP4, QuickTime or WebM reference videos are accepted.",
      );
    return {
      kind: "video",
      mime,
      format: mime.split("/")[1],
      declaredMime: declared,
    };
  }

  throw new MediaValidationError("Only supported image and video files are accepted.");
}
