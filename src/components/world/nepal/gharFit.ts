// Pure contain-fit for the Ghar window photo: the whole picture, never cropped.
/** Fractions (0..1) of the frame the image covers, centred; the rest is the dark-wood mat. */
export function containFit(imgAspect: number, frameAspect: number): { w: number; h: number } {
  if (!(imgAspect > 0) || !(frameAspect > 0)) return { w: 1, h: 1 };
  return imgAspect > frameAspect ? { w: 1, h: frameAspect / imgAspect } : { w: imgAspect / frameAspect, h: 1 };
}
