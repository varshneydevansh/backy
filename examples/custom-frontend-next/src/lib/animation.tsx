"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { acquireAnimationHydration } from "./portable-animation";

/** One document owner reconciles streamed routes and authored content changes. */
export function BackyAnimationHydrator() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    return acquireAnimationHydration({ root: document, engine: gsap });
  }, []);
  return null;
}
