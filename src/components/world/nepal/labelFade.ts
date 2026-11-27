// Zone-label fading (pure maths). A big label ("Contact") must not cover the view when it is close to the camera,
// and fades while drawn over the avatar; the other zone labels stay, they are the navigation.
const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fully gone at or below LABEL_GONE m from the camera, fully visible from LABEL_NEAR m. */
export const LABEL_NEAR = 6;
export const LABEL_GONE = 4.5;
export const labelNearK = (camDist: number) => smooth(camDist, LABEL_GONE, LABEL_NEAR);

/**
 * Opacity (0..1) of a zone label.
 *  gap        screen distance from the avatar to the label, in screen heights
 *  camDist    camera to label (m)
 *  avatarDist camera to avatar (m): a label nearer than the avatar sits between camera and avatar
 *  bubble     0..1 factor from the robot's speech bubble
 */
export function labelOpacity(gap: number, camDist: number, avatarDist: number, bubble = 1): number {
  const over = smooth(gap, 0.12, 0.24);
  const floor = camDist < avatarDist ? 0.02 : 0.15; // in front of the avatar: nearly gone; behind it: a ghost
  return (over * (1 - floor) + floor) * bubble * labelNearK(camDist);
}
