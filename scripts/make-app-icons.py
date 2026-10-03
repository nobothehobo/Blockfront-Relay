"""Rebuild the original voxel relay app icon (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / "client/public/icons"
out.mkdir(parents=True, exist_ok=True)
for size, name in [(180, "apple-touch-icon"), (192, "icon-192"), (512, "icon-512")]:
    image = Image.new("RGB", (512, 512), "#122a33")
    draw = ImageDraw.Draw(image)
    # Isometric blocks form an original stepped relay beacon, within maskable safe bounds.
    for x, y, tone in [(198, 316, "#335761"), (314, 316, "#406c72"),
                       (256, 280, "#57ded0"), (256, 210, "#57ded0"),
                       (256, 140, "#ff9d59")]:
        draw.polygon([(x, y-34), (x+55, y), (x, y+34), (x-55, y)], fill=tone)
        draw.polygon([(x-55, y), (x, y+34), (x, y+94), (x-55, y+60)], fill="#257e82")
        draw.polygon([(x, y+34), (x+55, y), (x+55, y+60), (x, y+94)], fill="#1e555e")
    image.resize((size, size), Image.Resampling.LANCZOS).save(out / f"{name}.png")
