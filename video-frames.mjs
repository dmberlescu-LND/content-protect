import { spawn } from "node:child_process";

const MAX_VIDEO_SECONDS = 10 * 60;
const MAX_FRAMES = 3;
const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

export class VideoFrameError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = "VideoFrameError";
    this.status = status;
  }
}

export function videoFramePlan(durationSeconds, maxFrames = MAX_FRAMES) {
  const duration = Number(durationSeconds),
    frameCount = Math.max(1, Math.min(MAX_FRAMES, Number(maxFrames) || 0));
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_VIDEO_SECONDS
  )
    throw new VideoFrameError(
      `Reference videos must be decodable and no longer than ${MAX_VIDEO_SECONDS / 60} minutes.`,
    );
  const framesPerSecond = Math.min(2, frameCount / duration);
  return {
    durationSeconds: duration,
    frameCount,
    framesPerSecond,
    timestamps: Array.from({ length: frameCount }, (_, index) =>
      Math.min(duration, index / framesPerSecond),
    ),
  };
}

export function splitJpegStream(stream, maxFrames = MAX_FRAMES) {
  if (!Buffer.isBuffer(stream))
    throw new VideoFrameError("The video frame output was invalid.", 502);
  const frames = [];
  let cursor = 0;
  while (frames.length < maxFrames) {
    const start = stream.indexOf(JPEG_START, cursor);
    if (start < 0) break;
    const end = stream.indexOf(JPEG_END, start + JPEG_START.length);
    if (end < 0) break;
    const frame = stream.subarray(start, end + JPEG_END.length);
    if (frame.length >= 256 && frame.length <= 5_000_000) frames.push(frame);
    cursor = end + JPEG_END.length;
  }
  if (!frames.length)
    throw new VideoFrameError(
      "No usable image frames could be extracted from this video.",
    );
  return frames;
}

export function runMediaCommand(
  command,
  args,
  input,
  { timeoutMs = 30_000, maxOutputBytes = 16_000_000 } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
      stdout = [],
      stderr = [];
    let outputBytes = 0,
      stderrBytes = 0,
      settled = false;
    const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      },
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(
          new VideoFrameError(
            "Video processing timed out. Try a shorter file.",
            503,
          ),
        );
      }, timeoutMs);
    child.on("error", (error) =>
      finish(
        new VideoFrameError(
          error?.code === "ENOENT"
            ? "Secure video frame processing is temporarily unavailable."
            : "The video processor could not start.",
          503,
        ),
      ),
    );
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(
          new VideoFrameError("The extracted video frames are too large."),
        );
      } else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderrBytes >= 4_000) return;
      const remaining = 4_000 - stderrBytes,
        boundedChunk = chunk.subarray(0, remaining);
      stderr.push(boundedChunk);
      stderrBytes += boundedChunk.length;
    });
    child.on("close", (code) => {
      if (code !== 0)
        return finish(
          new VideoFrameError(
            "The reference video is corrupt, disguised or unsupported.",
          ),
        );
      finish(null, Buffer.concat(stdout));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export async function extractVideoFrames(
  video,
  { runCommand = runMediaCommand, maxFrames = MAX_FRAMES } = {},
) {
  if (!Buffer.isBuffer(video) || !video.length)
    throw new VideoFrameError("The reference video is empty.");
  const probeOutput = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "pipe",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      "-i",
      "pipe:0",
    ],
    video,
    { timeoutMs: 12_000, maxOutputBytes: 32_000 },
  );
  let probe;
  try {
    probe = JSON.parse(probeOutput.toString("utf8"));
  } catch {
    throw new VideoFrameError(
      "The reference video is corrupt, disguised or unsupported.",
    );
  }
  const duration = Number(probe?.format?.duration),
    plan = videoFramePlan(duration, maxFrames),
    frameOutput = await runCommand(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "pipe",
        "-i",
        "pipe:0",
        "-map",
        "0:v:0",
        "-vf",
        `fps=${plan.framesPerSecond.toFixed(8)},scale=1200:1200:force_original_aspect_ratio=decrease`,
        "-frames:v",
        String(plan.frameCount),
        "-an",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-threads",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-q:v",
        "3",
        "pipe:1",
      ],
      video,
      { timeoutMs: 30_000, maxOutputBytes: 16_000_000 },
    ),
    frames = splitJpegStream(frameOutput, plan.frameCount);
  return {
    durationSeconds: plan.durationSeconds,
    frames: frames.map((buffer, index) => ({
      buffer,
      index,
      timestampSeconds: plan.timestamps[index],
    })),
  };
}
