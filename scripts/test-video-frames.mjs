import assert from "node:assert/strict";
import sharp from "sharp";

import {
  extractVideoFrames,
  splitJpegStream,
  VideoFrameError,
  videoFramePlan,
} from "../video-frames.mjs";

const plan = videoFramePlan(60);
assert.equal(plan.frameCount, 3);
assert.deepEqual(plan.timestamps, [0, 20, 40]);
assert.throws(() => videoFramePlan(601), VideoFrameError);

const first = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#7659e8" },
  })
    .jpeg()
    .toBuffer(),
  second = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#111016" },
  })
    .jpeg()
    .toBuffer(),
  stream = Buffer.concat([Buffer.from("noise"), first, second]);
assert.equal(splitJpegStream(stream).length, 2);
await assert.rejects(
  () =>
    extractVideoFrames(Buffer.from("video"), {
      runCommand: async () => Buffer.from("not-json"),
    }),
  (error) =>
    error instanceof VideoFrameError &&
    error.message.includes("corrupt, disguised or unsupported"),
);

const calls = [],
  extracted = await extractVideoFrames(Buffer.from("video"), {
    runCommand: async (command, args, input, options) => {
      calls.push({ command, args, input, options });
      return command === "ffprobe"
        ? Buffer.from(JSON.stringify({ format: { duration: "60" } }))
        : stream;
    },
  });
assert.equal(extracted.frames.length, 2);
assert.equal(extracted.frames[1].timestampSeconds, 20);
assert.deepEqual(
  calls.map((call) => call.command),
  ["ffprobe", "ffmpeg"],
);
for (const call of calls) {
  assert.equal(call.input.toString(), "video");
  assert.equal(call.args.includes("-protocol_whitelist"), true);
  assert.equal(call.args.includes("pipe"), true);
}
assert.equal(calls[1].args.includes("-map_metadata"), true);
assert.equal(calls[1].args.includes("-an"), true);
assert.equal(calls[1].args.includes("-sn"), true);
assert.equal(calls[1].args.includes("-dn"), true);
assert.equal(calls[1].args.includes("-threads"), true);

console.log(
  JSON.stringify({
    ok: true,
    maximumDurationMinutes: 10,
    maximumFrames: 3,
    metadataRemoved: true,
    audioAndSubtitlesExcluded: true,
    networkProtocolsBlocked: true,
    boundedProcessing: true,
  }),
);
