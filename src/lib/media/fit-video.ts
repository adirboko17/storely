export const VIDEO_UPLOAD_LIMIT = 50 * 1024 * 1024;

const TARGET_BYTES = 44 * 1024 * 1024;
const AUDIO_BITRATE = 128_000;
const MAX_VIDEO_BITRATE = 6_000_000;
const MIN_VIDEO_BITRATE = 350_000;

export class VideoFitError extends Error {}

export function needsVideoFit(file: File) {
  return file.size > VIDEO_UPLOAD_LIMIT;
}

export async function fitVideo(file: File, onProgress?: (progress: number) => void): Promise<File> {
  if (!needsVideoFit(file)) return file;
  if (typeof VideoEncoder === "undefined") throw new VideoFitError("הדפדפן הזה לא יכול לכווץ סרטונים. נסו בכרום או באדג׳.");

  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    const duration = await input.computeDuration();
    if (!track || !(duration > 0)) throw new VideoFitError("לא הצלחנו לקרוא את הסרטון.");

    const videoBitrate = Math.min(MAX_VIDEO_BITRATE, Math.floor((TARGET_BYTES * 8) / duration - AUDIO_BITRATE));
    if (videoBitrate < MIN_VIDEO_BITRATE) throw new VideoFitError(`הסרטון ארוך מדי (${Math.round(duration / 60)} דקות). נסו לקצר אותו ולהעלות שוב.`);

    const longSide = videoBitrate >= 3_500_000 ? 1920 : videoBitrate >= 1_500_000 ? 1280 : 960;
    const scale = Math.min(1, longSide / Math.max(track.displayWidth, track.displayHeight));
    const width = Math.max(2, Math.round((track.displayWidth * scale) / 2) * 2);
    const stats = await track.computePacketStats(120);
    const frameRate = stats.averagePacketRate > 31 ? 30 : undefined;

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: { codec: "avc", width, frameRate, quality: new Quality({ bitrate: videoBitrate, bitrateMode: "variable" }), forceTranscode: true },
      audio: { quality: new Quality({ bitrate: AUDIO_BITRATE }) },
    });
    if (!conversion.isValid || !conversion.utilizedTracks.some((item) => item.isVideoTrack())) {
      throw new VideoFitError("הדפדפן לא מצליח לפתוח את סוג הסרטון הזה. נסו לייצא אותו כ־mp4 ולהעלות שוב.");
    }
    if (onProgress) conversion.onProgress = (progress) => onProgress(Math.min(1, Math.max(0, progress)));
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer) throw new VideoFitError("כיווץ הסרטון נכשל.");
    if (buffer.byteLength > VIDEO_UPLOAD_LIMIT) throw new VideoFitError("גם אחרי כיווץ הסרטון גדול מ־50MB. נסו לקצר אותו.");
    const name = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([buffer], `${name}.mp4`, { type: "video/mp4" });
  } catch (error) {
    if (error instanceof VideoFitError) throw error;
    throw new VideoFitError("כיווץ הסרטון נכשל. נסו לייצא אותו כ־mp4 קטן יותר ולהעלות שוב.");
  } finally {
    input.dispose();
  }
}
