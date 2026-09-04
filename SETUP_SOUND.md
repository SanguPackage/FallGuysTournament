# Sound on the recording

The badge reads `recording — no sound` when the dshow audio input will not open: ffmpeg dies at
once, and the recorder respawns silently rather than not recording at all.

## Install the loopback device

`CAPTURE_AUDIO` defaults to `virtual-audio-capturer`, which taps the default output and changes
nothing about it. It ships with the [screen-capture-recorder installer][scr] — run it on Windows as
admin.

[scr]: https://github.com/rdp/screen-capture-recorder-to-video-windows-free/releases

Confirm ffmpeg lists it under audio:

```bash
"/mnt/c/Program Files/ShareX/ffmpeg.exe" -hide_banner -list_devices true -f dshow -i dummy
```

Restart the server. The badge reads `recording`.

## Recording something else

Any device name from that listing works:

```bash
CAPTURE_AUDIO="Microphone Array (Realtek(R) Audio)" bun run dev
CAPTURE_AUDIO=off bun run dev
```
