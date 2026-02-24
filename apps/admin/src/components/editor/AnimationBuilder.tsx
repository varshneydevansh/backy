/**
 * ==========================================================================
 * Animation Builder Component
 * ==========================================================================
 *
 * Visual interface for configuring GSAP animations on canvas elements.
 * Supports: fadeIn, slideIn, scaleIn, bounce, rotate, and custom animations.
 */

import React, { useState, useCallback } from 'react';
import type { AnimationConfig as SharedAnimationConfig } from '@/types/editor';

// ==========================================================================
// TYPES
// ==========================================================================

export interface AnimationConfig extends Omit<SharedAnimationConfig, 'type' | 'trigger'> {
    type: SharedAnimationConfig['type'] | 'none';
    trigger: SharedAnimationConfig['trigger'];
}

interface AnimationBuilderProps {
    animation?: AnimationConfig;
    onChange: (animation: AnimationConfig | undefined) => void;
}

// ==========================================================================
// CONSTANTS
// ==========================================================================

const ANIMATION_TYPES = [
    { value: 'none', label: 'None' },
    { value: 'fadeIn', label: 'Fade In' },
    { value: 'slideIn', label: 'Slide In' },
    { value: 'scaleIn', label: 'Scale In' },
    { value: 'bounce', label: 'Bounce' },
    { value: 'rotate', label: 'Rotate' },
    { value: 'custom', label: 'Custom' },
] as const;

const EASING_OPTIONS = [
    { value: 'power1.out', label: 'Ease Out (Soft)' },
    { value: 'power2.out', label: 'Ease Out (Medium)' },
    { value: 'power3.out', label: 'Ease Out (Strong)' },
    { value: 'power4.out', label: 'Ease Out (Extra)' },
    { value: 'power1.inOut', label: 'Ease In-Out (Soft)' },
    { value: 'power2.inOut', label: 'Ease In-Out (Medium)' },
    { value: 'elastic.out(1, 0.3)', label: 'Elastic' },
    { value: 'bounce.out', label: 'Bounce' },
    { value: 'back.out(1.7)', label: 'Back' },
    { value: 'linear', label: 'Linear' },
] as const;

const TRIGGER_OPTIONS = [
    { value: 'load', label: 'On Page Load' },
    { value: 'scroll', label: 'On Scroll Into View' },
    { value: 'hover', label: 'On Hover' },
] as const;

const DIRECTION_OPTIONS = [
    { value: 'up', label: '↑ Up' },
    { value: 'down', label: '↓ Down' },
    { value: 'left', label: '← Left' },
    { value: 'right', label: '→ Right' },
] as const;

const DEFAULT_ANIMATION: AnimationConfig = {
    type: 'fadeIn',
    duration: 0.6,
    delay: 0,
    easing: 'power2.out',
    trigger: 'load',
};

// ==========================================================================
// STYLES
// ==========================================================================

const styles = {
    container: {
        padding: '16px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
    } as React.CSSProperties,
    section: {
        marginBottom: '16px',
    } as React.CSSProperties,
    label: {
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        color: '#374151',
        marginBottom: '6px',
    } as React.CSSProperties,
    select: {
        width: '100%',
        padding: '8px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        fontSize: '14px',
        backgroundColor: '#ffffff',
    } as React.CSSProperties,
    input: {
        width: '100%',
        padding: '8px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        fontSize: '14px',
    } as React.CSSProperties,
    slider: {
        width: '100%',
        marginTop: '4px',
    } as React.CSSProperties,
    row: {
        display: 'flex',
        gap: '12px',
    } as React.CSSProperties,
    half: {
        flex: 1,
    } as React.CSSProperties,
    preview: {
        marginTop: '16px',
        padding: '24px',
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    } as React.CSSProperties,
    previewBox: {
        width: '80px',
        height: '80px',
        backgroundColor: '#3b82f6',
        borderRadius: '8px',
        transition: 'all 0.3s ease',
    } as React.CSSProperties,
    checkbox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
    } as React.CSSProperties,
};

// ==========================================================================
// ANIMATION BUILDER COMPONENT
// ==========================================================================

export function AnimationBuilder({ animation, onChange }: AnimationBuilderProps) {
    const [config, setConfig] = useState<AnimationConfig>(
        animation || DEFAULT_ANIMATION
    );
    const [isPlaying, setIsPlaying] = useState(false);

    const updateConfig = useCallback(
        (updates: Partial<AnimationConfig>) => {
            const newConfig = { ...config, ...updates };
            setConfig(newConfig);
            onChange(newConfig.type === 'none' ? undefined : newConfig);
        },
        [config, onChange]
    );

    const playPreview = useCallback(() => {
        setIsPlaying(true);
        setTimeout(() => setIsPlaying(false), (config.duration + config.delay) * 1000 + 100);
    }, [config]);

    const showDirectionOption = config.type === 'slideIn';
    const showScrollOptions = config.trigger === 'scroll';

    return (
        <div style={styles.container}>
            <h3
                style={{
                    margin: '0 0 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                }}
            >
                Animation Settings
            </h3>

            {/* Animation Type */}
            <div style={styles.section}>
                <label style={styles.label}>Animation Type</label>
                <select
                    style={styles.select}
                    value={config.type}
                    onChange={(e) =>
                        updateConfig({ type: e.target.value as AnimationConfig['type'] })
                    }
                >
                    {ANIMATION_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            {config.type !== 'none' && (
                <>
                    {/* Trigger */}
                    <div style={styles.section}>
                        <label style={styles.label}>Trigger</label>
                        <select
                            style={styles.select}
                            value={config.trigger}
                            onChange={(e) =>
                                updateConfig({ trigger: e.target.value as AnimationConfig['trigger'] })
                            }
                        >
                            {TRIGGER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Direction (for slideIn) */}
                    {showDirectionOption && (
                        <div style={styles.section}>
                            <label style={styles.label}>Direction</label>
                            <select
                                style={styles.select}
                                value={config.direction || 'up'}
                                onChange={(e) =>
                                    updateConfig({
                                        direction: e.target.value as AnimationConfig['direction'],
                                    })
                                }
                            >
                                {DIRECTION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Duration & Delay */}
                    <div style={{ ...styles.section, ...styles.row }}>
                        <div style={styles.half}>
                            <label style={styles.label}>
                                Duration: {config.duration.toFixed(1)}s
                            </label>
                            <input
                                type="range"
                                min="0.1"
                                max="3"
                                step="0.1"
                                value={config.duration}
                                onChange={(e) =>
                                    updateConfig({ duration: parseFloat(e.target.value) })
                                }
                                style={styles.slider}
                            />
                        </div>
                        <div style={styles.half}>
                            <label style={styles.label}>
                                Delay: {config.delay.toFixed(1)}s
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={config.delay}
                                onChange={(e) =>
                                    updateConfig({ delay: parseFloat(e.target.value) })
                                }
                                style={styles.slider}
                            />
                        </div>
                    </div>

                    {/* Easing */}
                    <div style={styles.section}>
                        <label style={styles.label}>Easing</label>
                        <select
                            style={styles.select}
                            value={config.easing}
                            onChange={(e) => updateConfig({ easing: e.target.value })}
                        >
                            {EASING_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Scroll Trigger Options */}
                    {showScrollOptions && (
                        <div
                            style={{
                                ...styles.section,
                                padding: '12px',
                                backgroundColor: '#f9fafb',
                                borderRadius: '6px',
                            }}
                        >
                            <label style={{ ...styles.label, marginBottom: '12px' }}>
                                Scroll Trigger Settings
                            </label>
                            <div style={styles.row}>
                                <div style={styles.half}>
                                    <label style={{ ...styles.label, fontSize: '11px' }}>
                                        Start
                                    </label>
                                    <input
                                        type="text"
                                        value={config.scrollTrigger?.start || 'top 80%'}
                                        onChange={(e) =>
                                            updateConfig({
                                                scrollTrigger: {
                                                    ...config.scrollTrigger,
                                                    start: e.target.value,
                                                    end: config.scrollTrigger?.end || 'bottom 20%',
                                                    scrub: config.scrollTrigger?.scrub || false,
                                                },
                                            })
                                        }
                                        style={styles.input}
                                        placeholder="top 80%"
                                    />
                                </div>
                                <div style={styles.half}>
                                    <label style={{ ...styles.label, fontSize: '11px' }}>
                                        End
                                    </label>
                                    <input
                                        type="text"
                                        value={config.scrollTrigger?.end || 'bottom 20%'}
                                        onChange={(e) =>
                                            updateConfig({
                                                scrollTrigger: {
                                                    ...config.scrollTrigger,
                                                    start: config.scrollTrigger?.start || 'top 80%',
                                                    end: e.target.value,
                                                    scrub: config.scrollTrigger?.scrub || false,
                                                },
                                            })
                                        }
                                        style={styles.input}
                                        placeholder="bottom 20%"
                                    />
                                </div>
                            </div>
                            <label style={{ ...styles.checkbox, marginTop: '12px' }}>
                                <input
                                    type="checkbox"
                                    checked={config.scrollTrigger?.scrub || false}
                                    onChange={(e) =>
                                        updateConfig({
                                            scrollTrigger: {
                                                ...config.scrollTrigger,
                                                start: config.scrollTrigger?.start || 'top 80%',
                                                end: config.scrollTrigger?.end || 'bottom 20%',
                                                scrub: e.target.checked,
                                            },
                                        })
                                    }
                                />
                                Scrub (link animation to scroll position)
                            </label>
                        </div>
                    )}

                    {/* Preview */}
                    <div style={styles.section}>
                        <button
                            onClick={playPreview}
                            style={{
                                width: '100%',
                                padding: '10px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            ▶ Preview Animation
                        </button>
                    </div>

                    <div style={styles.preview}>
                        <div
                            style={{
                                ...styles.previewBox,
                                opacity: isPlaying ? 1 : 0.5,
                                transform: isPlaying
                                    ? 'translateY(0) scale(1)'
                                    : config.type === 'slideIn'
                                        ? 'translateY(20px)'
                                        : config.type === 'scaleIn'
                                            ? 'scale(0.8)'
                                            : 'none',
                                transition: isPlaying
                                    ? `all ${config.duration}s ${config.easing}`
                                    : 'none',
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

export default AnimationBuilder;
