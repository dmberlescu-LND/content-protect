import assert from "node:assert/strict";
import sharp from "sharp";

import { extractVideoFrames, runMediaCommand } from "../video-frames.mjs";

const generatedVideo = await runMediaCommand(
  "ffmpeg",
  [
    "-v",
    "error",
    "-nostdin",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x120:rate=3:duration=2",
    "-an",
    "-c:v",
    "mpeg4",
    "-q:v",
    "5",
    "-movflags",
    "frag_keyframe+empty_moov",
    "-f",
    "mp4",
    "pipe:1",
  ],
  Buffer.alloc(0),
  { timeoutMs: 15_000, maxOutputBytes: 4_000_000 },
);

assert.ok(generatedVideo.length > 1_000);
const extracted = await extractVideoFrames(generatedVideo);
assert.ok(extracted.durationSeconds >= 1.9);
assert.ok(extracted.durationSeconds <= 2.1);
assert.ok(extracted.frames.length >= 1);
assert.ok(extracted.frames.length <= 3);
for (const frame of extracted.frames) {
  const metadata = await sharp(frame.buffer).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(metadata.width <= 1_200);
  assert.ok(metadata.height <= 1_200);
}

console.log(
  JSON.stringify({
    ok: true,
    generatedVideoBytes: generatedVideo.length,
    durationSeconds: extracted.durationSeconds,
    extractedFrames: extracted.frames.length,
  }),
);
