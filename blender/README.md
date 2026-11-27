# Blender characters

Pickable, genderless characters for the 3D portfolio. Everything is **built by Blender Python scripts**, headless,
with Blender 5.2, and run from the repo root. Nothing is modelled by hand in the GUI.

| Character | Status | Script | Web file |
|---|---|---|---|
| **Lakhey**, guardian dancer | v2 (realistic, MPFB body) | `scripts/make_lakhey.py` | `public/models/lakhey.glb` (0.82 MB, 23.8k tris) |
| **Clay** (clay maquette) | v2 | `scripts/make_clay.py` | `public/models/clay.glb` (0.40 MB, 18.0k tris) |
| **Astro** (explorer suit) | v2 | `scripts/make_astro.py` | `public/models/astro.glb` (0.50 MB, 19.8k tris) |
| Clay, Astro v1 (metaball bodies) | superseded | `scripts/v1/` | `export/v1/*.glb`, `characters/v1/*.blend` |

## One-time setup: MPFB2 (MakeHuman for Blender)
The v2 body comes from the **MPFB 2.0.18** extension (CC0 system assets). It is installed in the Blender *user profile*,
never in this repo:
```
B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --command extension install-file -r user_default add-on-mpfb-v2.0.18.zip --enable
```
(the zip comes from https://extensions.blender.org/add-ons/mpfb/). **Do not pass `--factory-startup`** to v2 scripts,
because that flag disables user extensions.

## Build the Lakhey
```
# 1. build: body + mask + hair + costume + rig + Idle/Dance  (about 3 min on the GPU)
"$B" --background --python blender/scripts/make_lakhey.py -- --stage full > blender/logs/make_lakhey.log 2>&1
#    (--stage mask builds only the mask -> blender/export/lakhey_mask_raw.glb)

# 2. compress for the web (Draco + WebP; mask textures stay 2048, the rest are already 1024/512)
npx --yes @gltf-transform/cli@4 optimize blender/export/lakhey_raw.glb public/models/lakhey.glb \
    --compress draco --texture-compress webp --texture-size 2048 --simplify false

# 3. previews, rendered from the COMPRESSED glb (what the web shows)
"$B" --background --python blender/scripts/render_preview.py -- --glb public/models/lakhey.glb \
    --shots front,34,back,dance,testpose,mask_closeup --samples 96
#    --quick = 640 px / 16 samples look-dev; --outdir DIR to render elsewhere
```

## Build Clay / Astro (about 1 min each)
```
"$B" --background --python blender/scripts/make_clay.py  > blender/logs/make_clay.log 2>&1
"$B" --background --python blender/scripts/make_astro.py > blender/logs/make_astro.log 2>&1
for n in clay astro; do
  npx --yes @gltf-transform/cli@4 optimize blender/export/${n}_raw.glb public/models/$n.glb       --compress draco --texture-compress webp --texture-size 1024 --simplify false
done
"$B" --background --python blender/scripts/render_preview.py -- --glb public/models/clay.glb  --prefix clay  --shots front,34,back,face,hand,testpose
"$B" --background --python blender/scripts/render_preview.py -- --glb public/models/astro.glb --prefix astro --shots front,34,back,visor,hand,testpose
"$B" --background --python blender/scripts/render_preview.py -- --glb public/models/clay.glb --shots lineup3   # all three
"$B" --background --python blender/scripts/compose_v1_vs_v2.py                                                # v1 vs v2 sheet
```
Bakes are 2048² (normal, base colour, roughness, AO -> ORM), downscaled to 1024 WebP by gltf-transform.

## Files (v2)
| Path | What |
|---|---|
| `scripts/common.py` | shared helpers: scene reset (extension-safe), numpy mesh ops/smoothing, world-space posing, rest-pose apply, GPU Cycles, selected-to-active bakes, ORM + AO glTF material, export |
| `scripts/base_body.py` | **the shared MPFB body and rig builder**, used by every v2 character: gender 0.5, neutralised chest/hips/waist, helpers removed, MPFB `mixamo` rig + CC0 weights, A-pose → T-pose rest |
| `scripts/lakhey_mask.py` | the procedural mask: one design drives the sculpt and the 2048 paint (see its docstring) |
| `scripts/lakhey_costume.py` | skin split, tunic, robe (skirt, sash, capes, wrist bands, sandals), bells, apron, hair, cloth bakes |
| `scripts/make_lakhey.py` | Lakhey assembly, weights, export |
| `scripts/clips.py` | the shared `Idle` + `Dance` clips (identical for all three characters) |
| `scripts/sculpt.py` | high-poly sculpt helpers (presses, concavity) + selected-to-active bake set (normal, colour, roughness, AO) |
| `scripts/make_clay.py` | Clay: faceless clay maquette; sculpt detail = thumb presses, tool marks, hairline cracks in creases |
| `scripts/make_astro.py` | Astro: suit shell with joint wrinkles, seams/zipper/stitches, quilted padding, pads; helmet, visor, rings, chest unit, backpack |
| `scripts/compose_v1_vs_v2.py` | the `previews/v1_vs_v2.png` comparison sheet |
| `scripts/render_preview.py` | studio look-dev renders (seamless cove, soft key, fill, rims, AgX, DOF) |
| `scripts/v1/` | the original metaball Clay/Astro scripts (kept for the v1 → v2 comparison) |
| `characters/lakhey.blend` | editable result (armature + one skinned mesh + both actions) |
| `export/` | uncompressed `*_raw.glb` + baked PNG textures |
| `previews/` | `lakhey_*.png`; v1 previews in `previews/v1/` |

## Rig (shared by all v2 characters)
* MPFB's built-in **`mixamo`** rig: exact Mixamo names, 52 bones including fingers, so no renaming table is needed.
  `mixamorig:Hips, Spine, Spine1, Spine2, Neck, Head, {Left,Right}Shoulder/Arm/ForeArm/Hand,
  {Left,Right}Hand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}, {Left,Right}UpLeg/Leg/Foot/ToeBase`.
* **Rest pose = T-pose** (MakeHuman's A-pose is posed to horizontal arms, applied to the mesh, then made the rest pose).
  Feet at Z=0, facing -Y in Blender (= +Z forward in glTF), about 1.72 m tall (1.9 m with the Lakhey mask and topknot).
* **three.js strips `:` from node names**, so in code the bones are `mixamorigHips`, `mixamorigLeftHand`, ...
* Max 4 weights per vertex, normalised.

## Lakhey details
* **Mask, metal parts, topknot:** rigid on `Head`. **Hair:** `Head` near the roots, blending to `Neck`/`Spine2` below the jaw.
* **Robe skirt:** `Hips` 1.0 at the waist, down to ≥0.4 at the hem, plus ≤0.3 `UpLeg` and ≤0.22 `Leg` per side, so it
  follows walking and the low dance stance (see `previews/lakhey_testpose.png`).
* **Bells:** rigid `Hips`. **Capes:** `Shoulder`/`Spine2` → `Arm`. **Wrist bands:** `ForeArm`. **Sandals:** `Foot`/`ToeBase`.
* **Clips** (30 fps, exported as separate glTF animations):
  `Idle` is a 2 s loop with arms relaxed, breathing and a slight sway.
  `Walk` 1.07 s, `Run` 0.7 s (21 frames, ground speed 4.2811 model m/s, stride 3.0 m per cycle; stance foot locked to that speed).
  `Dance` is a 15 s one-shot flag dance (450 frames; first/last frame = Idle t=0): stomps + half-turn, overhead flag wave, one-foot spin,
  big flag sweep, step-together + deep bow. The RIGHT hand keeps a closed grip on a 3 cm pole (`mixamorig:RightHand`, grip centre
  (-0.0069, 0.0867, 0.0059) m in bone-local space, pole up-axis (0.4513, 0.2419, 0.859)); planted feet are solved onto the floor per frame
  (`foot_state`/`solve_foot` in `clips.py`). Preview any clip: `scripts/clips_preview.py --clip Dance --pole --frames 200,300`.
* **Materials:** `Mask` (2048 base/ORM/normal, no coat), `Metal` (gold factor), `Hair` (512 strand textures),
  `Robe` (1024 atlas: skirt, sash, capes, wrist bands, sandals), `Tunic` (1024 ORM/normal, saffron factor), `Skin` (factor).
  The visible gloss comes from the roughness maps (lacquer 0.26, worn edges up to 0.46). Use an environment map in three.js.

## Tweaking
* Mask design: constants at the top of `lakhey_mask.py` (`EYE`, `MOUTH_W`, `mouth_up/lo`, colours in `COL`) and `design()`.
  The design functions are pure numpy, so they can be evaluated (and previewed) outside Blender.
* Costume colours: `ROBE_RED`, `TUNIC_YELLOW`, `SKIN`, `HAIR_RED` in `lakhey_costume.py`; skirt flare/folds in `skirt_points()`;
  hair amount/length in `make_hair()`.
* Poses: `dance_pose()`, `idle_pose()` in `make_lakhey.py` (world-axis degrees per bone).
* Budget: ≤ 25k tris (now about 23.8k), glb < 3 MB (now about 0.82 MB).

## Clay / Astro details
* **Clay:** `base_body.build_base(mannequin_face=True, head_scale=1.05)`, dressed in sculpted clay clothing (kurta top, flared kurta skirt to mid-thigh, belt, loose trousers, cuffs; anatomy smoothed away underneath). The eye pockets (surfaces facing the eyeball),
  mouth interior and ears are cut out, filled and relaxed into planes, so the nose bridge and brow remain. Chest, navel and groin are flattened
  into simple planes. Material `Clay`: orange terracotta with grog speckle, slab seams and tool marks, matte (roughness about 0.86, burnished ridges smoother).
  Tweak `CLAY*` colours, press count/size and crack strength in `clay_detail()`.
* **Astro:** materials `Suit` + `Trim` share one atlas (Trim = gloves, boots, helmet shell, chest unit, backpack, soles);
  `Visor` is near-black, metallic 0.85, roughness 0.06, opaque, with nothing behind it. `Metal` covers the rings and knobs; `Screen` is emissive.
  Rigid parts: helmet/visor → `Head`; neck ring, chest unit, backpack → `Spine2`; wrist rings → `ForeArm`; ankle rings → `Leg`.
* Previews use AgX at -0.5 EV exposure, and the fill light is hidden from reflections, so the visor shows one soft highlight (no "eyes").
