"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The "Explore my 3D town" button. It never prefetches on its own (the 3D world is heavy);
 * it warms the route only when the visitor hovers, touches or focuses it.
 */
export function ExploreLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return (
    <Link href={href} prefetch={false} className={className} onPointerEnter={warm} onTouchStart={warm} onFocus={warm}>
      {children}
    </Link>
  );
}
