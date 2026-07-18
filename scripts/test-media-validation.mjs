import assert from "node:assert/strict";
import sharp from "sharp";
import { inspectMedia, MediaValidationError } from "../media-validation.mjs";
import { prepareImageForProvider } from "../scanner.mjs";

const source = await sharp({
  create: {
    width: 80,
    height: 60,
    channels: 3,
    background: { r: 112, g: 84, b: 220 },
  },
})
  .withMetadata({ exif: { IFD0: { Artist: "Private creator metadata" } } })
  .jpeg()
  .toBuffer();

const inspected = await inspectMedia(source, "image/jpeg");
assert.equal(inspected.kind, "image");
assert.equal(inspected.mime, "image/jpeg");
assert.equal(inspected.width, 80);
assert.equal(inspected.height, 60);

const providerCopy = await prepareImageForProvider(source);
const providerMetadata = await sharp(providerCopy).metadata();
assert.equal(providerMetadata.exif, undefined);
assert.equal(providerMetadata.xmp, undefined);
assert.equal(providerMetadata.icc, undefined);

await assert.rejects(
  inspectMedia(Buffer.from("not a real image"), "image/png"),
  MediaValidationError,
);
await assert.rejects(
  inspectMedia(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"),
  MediaValidationError,
);

const mp4 = Buffer.alloc(24);
mp4.write("ftyp", 4, "ascii");
mp4.write("isom", 8, "ascii");
const video = await inspectMedia(mp4, "video/mp4");
assert.equal(video.mime, "video/mp4");

console.log(
  JSON.stringify({
    ok: true,
    imageSignatureVerified: true,
    providerMetadataRemoved: true,
    disguisedFileRejected: true,
    svgRejected: true,
    videoContainerVerified: true,
  }),
);
