type Orientation = ScreenOrientation & {
  lock?: (mode: string) => Promise<void>;
};
export async function enterMediaFullscreen(
  video: HTMLVideoElement,
  landscape = true,
) {
  const telegram = (window as any).Telegram?.WebApp;
  telegram?.unlockOrientation?.();
  let entered = false;
  if (video.requestFullscreen) {
    try {
      await video.requestFullscreen();
      entered = true;
    } catch {
      /* Try the native/Telegram interface next. */
    }
  }
  if (!entered && (video as any).webkitEnterFullscreen) {
    (video as any).webkitEnterFullscreen();
    entered = true;
  }
  if (!entered && telegram?.requestFullscreen) {
    telegram.requestFullscreen();
    entered = true;
  }
  if (!entered) throw new Error("Fullscreen is unavailable on this device.");
  try {
    await (screen.orientation as Orientation)?.lock?.(
      landscape ? "landscape" : "portrait",
    );
  } catch {
    /* Telegram/native player keeps device auto-rotation when locking is unsupported. */
  }
}
export async function exitMediaFullscreen() {
  if (document.fullscreenElement)
    await document.exitFullscreen().catch(() => {});
  const telegram = (window as any).Telegram?.WebApp;
  if (telegram?.isFullscreen) telegram.exitFullscreen?.();
  screen.orientation?.unlock?.();
}
