"""{{Title}} for the {{scene}}: {{one-line description}}.

Run (cwd = project root):
  {{blender path}} --background --factory-startup --python blender/craft_{{slug}}.py

Layout (Blender space, metres, Z up, viewer side -Y):
  {{describe origin, extents and where attachment points sit}}

ADAPT: SLUG/TITLE/DESCRIPTION, the REQUIRED constants, build(). Keep every random draw on `rng`.
"""
import importlib.util, math, random
from pathlib import Path
spec = importlib.util.spec_from_file_location('studio', Path(__file__).resolve().parent/'studio.py')
studio = importlib.util.module_from_spec(spec); spec.loader.exec_module(studio)
from mathutils import Vector

SLUG = '{{slug}}'; TITLE = '{{Title}}'; SUBTITLE = '{{alt title / other language}}'
SOURCE = 'public/references/source.png'
DESCRIPTION = 'Reference-guided stylised study of {{…}}.'
rng = random.Random(5)

# REQUIRED numbers the web scene depends on (asserted before export so a rebuild can't drift)
ROPE_TOP = 2.75

def build():
    b = studio.Builder()
    wood = studio.mat('Wood', (.42, .27, .15), kind='wood', rough=.75)
    rope = studio.mat('Rope', (.62, .52, .36), rough=.9)
    studio.box(b, wood, (0, 0, .02), (.24, .8, .04))                       # seat
    for y in (-.275, .275):
        studio.tube(b, rope, [(0, y, .04), (0, y, ROPE_TOP)], .015, sides=8)   # ropes
    b.emit()

studio.clear_scene()
build()
entry = studio.export(SLUG, TITLE, SUBTITLE, DESCRIPTION, SOURCE)
assert abs(entry['dimensions'][1] - ROPE_TOP) < 1e-3   # dimensions = [x, height, depth]
# Report: the EXPORTED line printed above + every REQUIRED number.
