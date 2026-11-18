"""Downsample the 2x canvas render to the YouTube thumbnail size (1280x720)."""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, "out", "final.png")).convert("RGB")
thumb = src.resize((1280, 720), Image.LANCZOS)
png = os.path.join(HERE, "gta6-letrev-thumbnail.png")
jpg = os.path.join(HERE, "gta6-letrev-thumbnail.jpg")
thumb.save(png, optimize=True)
thumb.save(jpg, quality=93, subsampling=0, optimize=True)
for f in (png, jpg):
    print(f"{os.path.basename(f)}: {thumb.size[0]}x{thumb.size[1]}, {os.path.getsize(f) / 1024:.0f} KB")
