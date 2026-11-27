"""
Encode the rendered PNG frames into the web loop + poster (plain Python, no Blender needed).

  python blender/scripts/pagoda_encode.py FRAMES_DIR day|night
    FRAMES_DIR holds day_0000.png .. day_0167.png (or night_*) from pagoda_scene.py.
  -> public/recruiter/pagoda-<variant>.mp4  (h264, no audio, crf 25, maxrate 1000k, faststart)
     public/recruiter/pagoda-<variant>.webm (VP9; deleted again unless >= 15 % smaller than the mp4)
     public/recruiter/poster-<variant>.webp (frame 0, 1280x720)
"""
import os
import subprocess
import sys

FFMPEG = os.environ.get(
    "FFMPEG",
    r"C:\Users\Yanish Gurung\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.1-full_build\bin\ffmpeg.exe",
)
frames, variant = sys.argv[1], sys.argv[2]
out = os.path.join(os.path.dirname(__file__), "..", "..", "public", "recruiter")
os.makedirs(out, exist_ok=True)
pat = os.path.join(frames, f"{variant}_%04d.png")
mp4 = os.path.join(out, f"pagoda-{variant}.mp4")
webm = os.path.join(out, f"pagoda-{variant}.webm")
poster = os.path.join(out, f"poster-{variant}.webp")


def run(*a):
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *a], check=True)


run("-framerate", "24", "-start_number", "0", "-i", pat, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "25",
    "-maxrate", "1000k", "-bufsize", "2000k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4)
run("-framerate", "24", "-start_number", "0", "-i", pat, "-an", "-c:v", "libvpx-vp9", "-b:v", "900k", "-crf", "34",
    "-maxrate", "1000k", "-row-mt", "1", "-pix_fmt", "yuv420p", webm)
for q in (82, 74, 66, 58, 50):
    run("-i", os.path.join(frames, f"{variant}_0000.png"), "-frames:v", "1", "-c:v", "libwebp", "-quality", str(q), poster)
    if os.path.getsize(poster) <= 120 * 1024:
        break
a, b = os.path.getsize(mp4), os.path.getsize(webm)
print(f"mp4 {a/1024:.0f} KB  webm {b/1024:.0f} KB  poster {os.path.getsize(poster)/1024:.0f} KB (q{q})")
if b > a * 0.85:
    os.remove(webm)
    print("webm not >=15% smaller: removed, mp4 only")
