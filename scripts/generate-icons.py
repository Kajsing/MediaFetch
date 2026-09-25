"""Render the original geometric MediaFetch mark for Chrome's raster icon slots."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "extension" / "assets" / "icons"
root.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (512, 512))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, 511, 511), radius=144, fill="#a9efd0")
for points in [[(256, 112), (256, 312)], [(176, 240), (256, 320), (336, 240)], [(144, 360), (144, 408), (368, 408), (368, 360)]]:
    draw.line(points, fill="#142e29", width=40, joint="curve")
    for x, y in (points[0], points[-1]):
        draw.ellipse((x-20, y-20, x+20, y+20), fill="#142e29")
for size in (16, 32, 48, 128):
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f"{size}.png")
