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
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("aria-hidden", "true");
  // Keep the decoder attached and renderable: display:none/detached video can
  // suppress frame delivery in embedded mobile browsers.
  video.style.cssText = "position:fixed;left:-10px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  const choices: ThumbnailChoice[] = [];
  const wait = (events: string[], start: () => void, ready: () => boolean = () => true) =>
    new Promise<void>((resolve, reject) => {
      const done = () => {
        if (!ready()) return;
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(
          new Error(
            signal?.aborted
              ? "Thumbnail generation cancelled."
              : video.error?.code === 3 || video.error?.code === 4
                ? "This device cannot decode a preview right now. This can be a temporary decoder, file-access, or video-format problem; it does not prove the codec is unsupported. Retry with Telegram open, choose a local file, or use a cover image and save as a draft for playback testing."
                : "The video could not be read on this device. Retry, choose a local file, or use a cover image and save as a draft.",
          ),
        );
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Thumbnail preparation timed out. Keep Telegram open and retry, or choose a cover image. This does not necessarily mean the video codec is unsupported."));
      }, 30000);
      const cleanup = () => {
        clearTimeout(timer);
        events.forEach((event) => video.removeEventListener(event, done));
        video.removeEventListener("error", fail);
        signal?.removeEventListener("abort", fail);
      };
      events.forEach((event) => video.addEventListener(event, done));
      video.addEventListener("error", fail, { once: true });
      signal?.addEventListener("abort", fail, { once: true });
      if (signal?.aborted) fail();
      else {
        try { start(); }
        catch (error) { cleanup(); reject(error); }
      }
    });
  try {
    await wait(["loadedmetadata", "loadeddata", "canplay"], () => {
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
        await wait(["seeked"], () => {
          video.currentTime = at;
        });
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
        await wait(["loadeddata", "canplay", "seeked"], () => {}, () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
      if (!video.videoWidth || !video.videoHeight)
        throw new Error("A video frame is not available. Retry or choose a cover image.");
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
      signal?.throwIfAborted();
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
    if(choices.length && !signal?.aborted) return {duration:Math.round(video.duration)||0,width:video.videoWidth||0,height:video.videoHeight||0,choices};
    choices.forEach((choice) => URL.revokeObjectURL(choice.url));
    throw error;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(source);
  }
}
