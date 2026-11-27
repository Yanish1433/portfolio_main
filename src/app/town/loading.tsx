import { LoadingArt } from "@/components/world/loading/LoadingArt";
import { TIPS } from "@/components/world/loading/progress";

// Route Suspense fallback: the static shell (no client JS yet). WorldClient's LoadingOverlay takes over with the real bar.
export default function Loading() {
  return <LoadingArt tip={TIPS[0]} />;
}
