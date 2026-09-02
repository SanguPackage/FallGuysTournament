const MOUNT = /^\/mnt\/([a-z])(\/.*)?$/i;

/**
 * The path form `ffmpeg.exe` understands. Everything Bun touches stays in WSL form; only the file
 * arguments handed to a Windows process go through here. A path that is not a WSL mount is returned
 * unchanged, so an already-Windows path passes through.
 */
export function toWindows(path: string): string {
  const mount = MOUNT.exec(path);
  if (!mount) return path;
  const drive = mount[1]!.toUpperCase();
  const rest = (mount[2] ?? "").replace(/\//g, "\\");
  return `${drive}:${rest || "\\"}`;
}
