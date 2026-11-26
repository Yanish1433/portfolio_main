# External assets

| Asset | Version | Source | Licence | Where it lives |
|---|---|---|---|---|
| MPFB2 (MakeHuman plugin for Blender) | 2.0.18 (build 20261010) | https://extensions.blender.org/add-ons/mpfb/ (zip sha256 c075b3e9…2a2dad) | Code: GPL-3.0-or-later. Bundled base mesh, targets, rigs and weights: CC0 (MakeHuman system assets) | Installed in the user profile `%APPDATA%/Blender Foundation/Blender/5.2/extensions/user_default/mpfb`, **not** in this repo. No MPFB code or asset files are copied here; scripts only call its services at build time. |

Used from MPFB: the `base.obj` body, macro targets plus a few body targets (chest, hips, waist, navel, ears, lips), and the `mixamo` rig with `weights.mixamo.json`.
The CC-BY eye pack and community assets are NOT used.

## Captain-supplied references (Lakhey)
`lakhey-mask-ref.jpg` (photo watermarked by its photographer) and `lakhey-dancer-ref.jpg` (source unknown) are in `.firstmate/refs/`, not in this repo.
They are **visual reference only**: I looked at them to understand shapes, colours and costume layout. They are **not** used as a texture, projection or trace. The Lakhey mask is an original procedural design (`blender/scripts/lakhey_mask.py`); every line, flame and ornament is drawn by code in UV space.
