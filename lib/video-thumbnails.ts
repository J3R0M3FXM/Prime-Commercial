export type ThumbnailChoice = { url: string; file: File; label: string };
export type VideoInspection = {
  duration: number;
  width: number;
  height: number;
  choices: ThumbnailChoice[];
};

export async function inspectVideo(
  file: File,
  signal?: AbortSignal,
): Promise<VideoInspection> {
  const source = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const choices: ThumbnailChoice[] = [];
  const wait = (event: string, start: () => void) =>
    new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(
          new Error(
            signal?.aborted
              ? "Thumbnail generation cancelled."
              : "This video could not be decoded. Choose an MP4 with H.264 video.",
          ),
        );
      };
      const timer = setTimeout(fail, 15000);
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener("error", fail);
        signal?.removeEventListener("abort", fail);
      };
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", fail, { once: true });
      signal?.addEventListener("abort", fail, { once: true });
      if (signal?.aborted) fail();
      else start();
    });
  try {
    await wait("loadeddata", () => {
      video.src = source;
      video.load();
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("Video duration is unavailable.");
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Thumbnail generation is unavailable.");
    for (const [index, ratio] of [0.15, 0.5, 0.85].entries()) {
      signal?.throwIfAborted();
      const at = Math.max(
        0.001,
        Math.min(video.duration - 0.001, video.duration * ratio),
      );
      if (Math.abs(video.currentTime - at) > 0.0001)
        await wait("seeked", () => {
          video.currentTime = at;
        });
      const scale = Math.max(
        canvas.width / video.videoWidth,
        canvas.height / video.videoHeight,
      );
      context.drawImage(
        video,
        (canvas.width - video.videoWidth * scale) / 2,
        (canvas.height - video.videoHeight * scale) / 2,
        video.videoWidth * scale,
        video.videoHeight * scale,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Thumbnail generation failed.")),
          "image/jpeg",
          0.82,
        ),
      );
      const image = new File([blob], `thumbnail-${index + 1}.jpg`, {
        type: "image/jpeg",
      });
      choices.push({
        url: URL.createObjectURL(blob),
        file: image,
        label: ["Opening", "Middle", "Closing"][index],
      });
    }
    return {
      duration: Math.round(video.duration),
      width: video.videoWidth,
      height: video.videoHeight,
      choices,
    };
  } catch (error) {
    choices.forEach((choice) => URL.revokeObjectURL(choice.url));
    throw error;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(source);
  }
}
