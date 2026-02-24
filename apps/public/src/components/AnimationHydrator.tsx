'use client';

/**
 * ==========================================================================
 * GSAP Animation Hydration
 * ==========================================================================
 *
 * Client-side script that hydrates animation data attributes into
 * actual GSAP animations.
 */

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
if (typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
}

interface AnimationConfig {
    type: 'fadeIn' | 'slideIn' | 'scaleIn' | 'bounce' | 'rotate' | 'custom';
    duration: number;
    delay?: number;
    easing?: string;
    direction?: 'left' | 'right' | 'up' | 'down';
    from?: Record<string, unknown>;
    to?: Record<string, unknown>;
    trigger?: 'load' | 'scroll' | 'hover';
    scrollTrigger?: {
        start?: string;
        end?: string;
        scrub?: boolean;
    };
}

/**
 * Get GSAP animation properties from config
 */
function getAnimationProps(config: AnimationConfig): gsap.TweenVars {
    const { type, duration, delay = 0, easing = 'power2.out', direction = 'up' } = config;

    const baseProps: gsap.TweenVars = {
        duration,
        delay,
        ease: easing,
    };

    switch (type) {
        case 'fadeIn':
            return {
                ...baseProps,
                opacity: 0,
            };

        case 'slideIn': {
            const slideDistance = 50;
            const slideProps: gsap.TweenVars = { ...baseProps, opacity: 0 };

            switch (direction) {
                case 'left':
                    slideProps.x = -slideDistance;
                    break;
                case 'right':
                    slideProps.x = slideDistance;
                    break;
                case 'up':
                    slideProps.y = slideDistance;
                    break;
                case 'down':
                    slideProps.y = -slideDistance;
                    break;
            }
            return slideProps;
        }

        case 'scaleIn':
            return {
                ...baseProps,
                scale: 0.8,
                opacity: 0,
            };

        case 'bounce':
            return {
                ...baseProps,
                y: -20,
                ease: 'bounce.out',
            };

        case 'rotate':
            return {
                ...baseProps,
                rotation: -180,
                opacity: 0,
            };

        case 'custom':
            return {
                ...baseProps,
                ...config.from,
            };

        default:
            return baseProps;
    }
}

/**
 * AnimationHydrator component
 *
 * Scans the DOM for elements with animation data attributes
 * and applies GSAP animations.
 */
export function AnimationHydrator() {
    useEffect(() => {
        // Find all elements with animation data
        const animatedElements = document.querySelectorAll('[data-animation]');

        animatedElements.forEach((element) => {
            try {
                const configStr = element.getAttribute('data-animation');
                if (!configStr) return;

                const config: AnimationConfig = JSON.parse(configStr);
                const fromProps = getAnimationProps(config);

                // Set initial state
                gsap.set(element, fromProps);

                if (config.trigger === 'scroll' && config.scrollTrigger) {
                    // Scroll-triggered animation
                    gsap.to(element, {
                        ...config.to,
                        opacity: 1,
                        x: 0,
                        y: 0,
                        scale: 1,
                        rotation: 0,
                        duration: config.duration,
                        ease: config.easing || 'power2.out',
                        scrollTrigger: {
                            trigger: element,
                            start: config.scrollTrigger.start || 'top 80%',
                            end: config.scrollTrigger.end || 'bottom 20%',
                            scrub: config.scrollTrigger.scrub,
                        },
                    });
                } else if (config.trigger === 'hover') {
                    // Hover animation
                    element.addEventListener('mouseenter', () => {
                        gsap.to(element, {
                            ...config.to,
                            duration: config.duration,
                            ease: config.easing || 'power2.out',
                        });
                    });

                    element.addEventListener('mouseleave', () => {
                        gsap.to(element, {
                            ...fromProps,
                            duration: config.duration,
                            ease: config.easing || 'power2.out',
                        });
                    });
                } else {
                    // Load animation (default)
                    gsap.to(element, {
                        ...config.to,
                        opacity: 1,
                        x: 0,
                        y: 0,
                        scale: 1,
                        rotation: 0,
                        duration: config.duration,
                        delay: config.delay,
                        ease: config.easing || 'power2.out',
                    });
                }
            } catch (error) {
                console.error('Failed to parse animation config:', error);
            }
        });

        // Cleanup
        return () => {
            ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
        };
    }, []);

    return null;
}

export default AnimationHydrator;
