'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { acquireAnimationHydration } from '../lib/animationHydration';

export function AnimationHydrator() {
    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);
        return acquireAnimationHydration({ root: document, engine: gsap });
    }, []);
    return null;
}

export default AnimationHydrator;
