"""Side-by-side v1 vs v2 comparison (top row v1, bottom row v2) -> blender/previews/v1_vs_v2.png.

  blender.exe --background --python blender/scripts/compose_v1_vs_v2.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402

import common as C  # noqa: E402

PV = os.path.join(C.ROOT, "blender", "previews")
CELL = 640
rows = [[os.path.join(PV, "v1", "clay_front.png"), os.path.join(PV, "v1", "astro_front.png")],
        [os.path.join(PV, "clay_front.png"), os.path.join(PV, "astro_front.png")]]
out = np.zeros((2 * CELL, 2 * CELL, 4), dtype=np.float32)
for r, row in enumerate(rows):
    for c, path in enumerate(row):
        img = bpy.data.images.load(path)
        img.scale(CELL, CELL)
        px = np.empty(CELL * CELL * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        # Blender rows start at the bottom: row 0 (v1) goes on top
        y0 = (1 - r) * CELL
        out[y0:y0 + CELL, c * CELL:(c + 1) * CELL] = px.reshape(CELL, CELL, 4)
res = bpy.data.images.new("v1_vs_v2", 2 * CELL, 2 * CELL, alpha=False)
res.pixels.foreach_set(out.ravel())
res.filepath_raw = os.path.join(PV, "v1_vs_v2.png")
res.file_format = "PNG"
res.save()
print("SAVED", res.filepath_raw)
