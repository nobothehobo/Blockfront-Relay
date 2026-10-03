"""Rebuild the original voxel relay app icon (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / "client/public/icons"
out.mkdir(parents=True, exist_ok=True)
for size, name in [(180, "apple-touch-icon"), (192, "icon-192"), (512, "icon-512")]:
    image = Image.new("RGB", (512, 512), "#122a33")
    draw = ImageDraw.Draw(image)
    # Wide voxel fortress with an original pixel BR monogram. Keep the design
    # inside the circular maskable safe zone, readable even at Home Screen size.
    draw.polygon([(142, 350), (344, 350), (370, 328), (370, 366),
                  (344, 388), (142, 388)], fill="#0b1d24")
    draw.polygon([(142, 220), (344, 220), (370, 198), (168, 198)], fill="#91eee0")
    draw.polygon([(344, 220), (370, 198), (370, 328), (344, 350)], fill="#257e82")
    draw.rectangle((142, 220, 344, 350), fill="#57ded0")
    for x in [142, 216, 290]:
        draw.polygon([(x, 186), (x+54, 186), (x+80, 164), (x+26, 164)], fill="#ffc180")
        draw.polygon([(x+54, 186), (x+80, 164), (x+80, 202), (x+54, 224)], fill="#ac613f")
        draw.rectangle((x, 186, x+54, 224), fill="#ff9d59")
    letters = [
        ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
        ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    ]
    for letter, left in zip(letters, [164, 256]):
        for row, line in enumerate(letter):
            for col, pixel in enumerate(line):
                if pixel == "1":
                    x, y = left + col*12, 246 + row*12
                    draw.rectangle((x, y, x+11, y+11), fill="#122a33")
    image.resize((size, size), Image.Resampling.LANCZOS).save(out / f"{name}.png")
