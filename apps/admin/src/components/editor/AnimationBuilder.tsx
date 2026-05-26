/**
 * ==========================================================================
 * Animation Builder Component
 * ==========================================================================
 *
 * Visual interface for configuring GSAP animations on canvas elements.
 * Supports: fadeIn, slideIn, scaleIn, bounce, rotate, and custom animations.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { AnimationConfig as SharedAnimationConfig } from '@/types/editor';
import { buildEditorActionStatus } from './editorActionStatus';

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

const DEFAULT_CUSTOM_FROM: Record<string, unknown> = {
    opacity: 0,
    y: 24,
};

const DEFAULT_CUSTOM_TO: Record<string, unknown> = {
    opacity: 1,
    y: 0,
};

const normalizeAnimationConfig = (animation?: AnimationConfig): AnimationConfig => ({
    ...DEFAULT_ANIMATION,
    ...(animation || {}),
});

const stringifyCustomAnimationObject = (value: Record<string, unknown> | undefined): string => (
    JSON.stringify(value || {}, null, 2)
);

const parseCustomAnimationObject = (value: string): { value?: Record<string, unknown>; error?: string } => {
    const trimmed = value.trim();
    if (!trimmed) {
        return { value: {} };
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { error: 'Use a JSON object, for example { "opacity": 0, "y": 24 }.' };
        }

        return { value: parsed as Record<string, unknown> };
    } catch {
        return { error: 'Invalid JSON object.' };
    }
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
    srOnly: {
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
    } as React.CSSProperties,
};

const optionLabel = <T extends readonly { value: string; label: string }[]>(options: T, value: string): string => (
    options.find((option) => option.value === value)?.label || value
);

// ==========================================================================
// ANIMATION BUILDER COMPONENT
// ==========================================================================

export function AnimationBuilder({ animation, onChange }: AnimationBuilderProps) {
    const initialConfig = normalizeAnimationConfig(animation);
    const [config, setConfig] = useState<AnimationConfig>(initialConfig);
    const [isPlaying, setIsPlaying] = useState(false);
    const [customFromText, setCustomFromText] = useState(() => (
        stringifyCustomAnimationObject(initialConfig.from || DEFAULT_CUSTOM_FROM)
    ));
    const [customToText, setCustomToText] = useState(() => (
        stringifyCustomAnimationObject(initialConfig.to || DEFAULT_CUSTOM_TO)
    ));
    const [customJsonErrors, setCustomJsonErrors] = useState<{ from?: string; to?: string }>({});

    useEffect(() => {
        const nextConfig = normalizeAnimationConfig(animation);
        setConfig(nextConfig);
        setCustomFromText(stringifyCustomAnimationObject(nextConfig.from || DEFAULT_CUSTOM_FROM));
        setCustomToText(stringifyCustomAnimationObject(nextConfig.to || DEFAULT_CUSTOM_TO));
        setCustomJsonErrors({});
    }, [animation]);

    const updateConfig = useCallback(
        (updates: Partial<AnimationConfig>) => {
            const newConfig = { ...config, ...updates };
            setConfig(newConfig);
            onChange(newConfig.type === 'none' ? undefined : newConfig);
        },
        [config, onChange]
    );

    const handleAnimationTypeChange = useCallback((type: AnimationConfig['type']) => {
        if (type === 'custom') {
            const from = config.from || DEFAULT_CUSTOM_FROM;
            const to = config.to || DEFAULT_CUSTOM_TO;
            setCustomFromText(stringifyCustomAnimationObject(from));
            setCustomToText(stringifyCustomAnimationObject(to));
            setCustomJsonErrors({});
            updateConfig({ type, from, to });
            return;
        }

        updateConfig({ type });
    }, [config.from, config.to, updateConfig]);

    const handleCustomObjectChange = useCallback((target: 'from' | 'to', value: string) => {
        if (target === 'from') {
            setCustomFromText(value);
        } else {
            setCustomToText(value);
        }

        const parsed = parseCustomAnimationObject(value);
        setCustomJsonErrors((current) => ({
            ...current,
            [target]: parsed.error,
        }));

        if (parsed.error || !parsed.value) {
            return;
        }

        updateConfig(target === 'from' ? { from: parsed.value } : { to: parsed.value });
    }, [updateConfig]);

    const playPreview = useCallback(() => {
        setIsPlaying(true);
        setTimeout(() => setIsPlaying(false), (config.duration + config.delay) * 1000 + 100);
    }, [config]);

    const showDirectionOption = config.type === 'slideIn';
    const showScrollOptions = config.trigger === 'scroll';
    const animationActionStatusId = 'editor-animation-action-status';
    const activeAnimationLabel = optionLabel(ANIMATION_TYPES, config.type);
    const activeTriggerLabel = optionLabel(TRIGGER_OPTIONS, config.trigger);
    const hasCustomJsonError = Boolean(customJsonErrors.from || customJsonErrors.to);
    const animationBuilderAction = buildEditorActionStatus({
        label: 'Animation builder',
        disabledReason: hasCustomJsonError ? customJsonErrors.from || customJsonErrors.to || 'Fix the custom animation JSON.' : '',
        selected: config.type !== 'none',
        readyStatus: 'Animation builder ready. Choose an animation type to enable motion.',
        selectedStatus: `${activeAnimationLabel} animation uses ${activeTriggerLabel.toLowerCase()}, ${config.duration.toFixed(1)}s duration, and ${config.delay.toFixed(1)}s delay.`,
    });
    const animationTypeAction = buildEditorActionStatus({
        label: 'Animation type',
        selected: config.type !== 'none',
        readyStatus: 'Animation type ready. Current value: None.',
        selectedStatus: `Animation type ${activeAnimationLabel} selected.`,
    });
    const animationTriggerAction = buildEditorActionStatus({
        label: 'Animation trigger',
        readyStatus: `Animation trigger ${activeTriggerLabel} selected.`,
    });
    const animationDirectionAction = buildEditorActionStatus({
        label: 'Animation direction',
        readyStatus: `Animation direction ${optionLabel(DIRECTION_OPTIONS, config.direction || 'up')} selected.`,
    });
    const animationDurationAction = buildEditorActionStatus({
        label: 'Animation duration',
        readyStatus: `Animation duration ${config.duration.toFixed(1)} seconds selected.`,
    });
    const animationDelayAction = buildEditorActionStatus({
        label: 'Animation delay',
        readyStatus: `Animation delay ${config.delay.toFixed(1)} seconds selected.`,
    });
    const animationEasingAction = buildEditorActionStatus({
        label: 'Animation easing',
        readyStatus: `Animation easing ${optionLabel(EASING_OPTIONS, config.easing)} selected.`,
    });
    const customDefaultsAction = buildEditorActionStatus({
        label: 'Reset custom motion',
        readyStatus: 'Reset custom motion to the default from/to JSON objects.',
    });
    const scrollScrubAction = buildEditorActionStatus({
        label: 'Scroll scrub',
        selected: Boolean(config.scrollTrigger?.scrub),
        readyStatus: 'Scroll scrub is off.',
        selectedStatus: 'Scroll scrub is on.',
    });
    const previewAction = buildEditorActionStatus({
        label: 'Preview animation',
        busy: isPlaying,
        busyStatus: `Previewing ${activeAnimationLabel} animation.`,
        readyStatus: `Preview ${activeAnimationLabel} animation.`,
    });
    const animationActionSummary = [
        animationBuilderAction.actionStatus,
        hasCustomJsonError ? 'Custom JSON has validation errors.' : 'Custom JSON is valid.',
        previewAction.actionStatus,
    ].join(' ');

    return (
        <div
            style={styles.container}
            data-testid="editor-animation-builder"
            data-animation-type={config.type}
            data-animation-trigger={config.trigger}
            data-animation-playing={isPlaying ? 'true' : 'false'}
            data-action-state={animationBuilderAction.actionState}
            data-action-status={animationBuilderAction.actionStatus}
            data-disabled-reason={animationBuilderAction.disabledReason || undefined}
        >
            <span
                id={animationActionStatusId}
                style={styles.srOnly}
                data-testid="editor-animation-action-status"
                aria-live="polite"
            >
                {animationActionSummary}
            </span>
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
                    data-testid="editor-animation-type"
                    aria-describedby={animationActionStatusId}
                    data-action-state={animationTypeAction.actionState}
                    data-action-status={animationTypeAction.actionStatus}
                    value={config.type}
                    onChange={(e) =>
                        handleAnimationTypeChange(e.target.value as AnimationConfig['type'])
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
                            data-testid="editor-animation-trigger"
                            aria-describedby={animationActionStatusId}
                            data-action-state={animationTriggerAction.actionState}
                            data-action-status={animationTriggerAction.actionStatus}
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
                                data-testid="editor-animation-direction"
                                aria-describedby={animationActionStatusId}
                                data-action-state={animationDirectionAction.actionState}
                                data-action-status={animationDirectionAction.actionStatus}
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
                                data-testid="editor-animation-duration"
                                aria-describedby={animationActionStatusId}
                                data-action-state={animationDurationAction.actionState}
                                data-action-status={animationDurationAction.actionStatus}
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
                                data-testid="editor-animation-delay"
                                aria-describedby={animationActionStatusId}
                                data-action-state={animationDelayAction.actionState}
                                data-action-status={animationDelayAction.actionStatus}
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

                    {config.type === 'custom' && (
                        <div
                            style={{
                                ...styles.section,
                                padding: '12px',
                                backgroundColor: '#f9fafb',
                                borderRadius: '6px',
                            }}
                            data-testid="editor-animation-custom-props"
                        >
                            <label style={{ ...styles.label, marginBottom: '12px' }}>
                                Custom GSAP state
                            </label>
                            <div style={styles.row}>
                                <div style={styles.half}>
                                    <label style={{ ...styles.label, fontSize: '11px' }}>
                                        From JSON
                                    </label>
                                    <textarea
                                        data-testid="editor-animation-custom-from"
                                        value={customFromText}
                                        onChange={(e) => handleCustomObjectChange('from', e.target.value)}
                                        style={{ ...styles.input, minHeight: '96px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                                        aria-describedby={animationActionStatusId}
                                        aria-invalid={customJsonErrors.from ? 'true' : 'false'}
                                        data-action-state={customJsonErrors.from ? 'blocked' : 'ready'}
                                        data-action-status={customJsonErrors.from ? `From JSON unavailable: ${customJsonErrors.from}` : 'From JSON ready.'}
                                    />
                                    {customJsonErrors.from ? (
                                        <div
                                            data-testid="editor-animation-custom-from-error"
                                            style={{ marginTop: '4px', color: '#b91c1c', fontSize: '11px' }}
                                        >
                                            {customJsonErrors.from}
                                        </div>
                                    ) : null}
                                </div>
                                <div style={styles.half}>
                                    <label style={{ ...styles.label, fontSize: '11px' }}>
                                        To JSON
                                    </label>
                                    <textarea
                                        data-testid="editor-animation-custom-to"
                                        value={customToText}
                                        onChange={(e) => handleCustomObjectChange('to', e.target.value)}
                                        style={{ ...styles.input, minHeight: '96px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                                        aria-describedby={animationActionStatusId}
                                        aria-invalid={customJsonErrors.to ? 'true' : 'false'}
                                        data-action-state={customJsonErrors.to ? 'blocked' : 'ready'}
                                        data-action-status={customJsonErrors.to ? `To JSON unavailable: ${customJsonErrors.to}` : 'To JSON ready.'}
                                    />
                                    {customJsonErrors.to ? (
                                        <div
                                            data-testid="editor-animation-custom-to-error"
                                            style={{ marginTop: '4px', color: '#b91c1c', fontSize: '11px' }}
                                        >
                                            {customJsonErrors.to}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                type="button"
                                data-testid="editor-animation-custom-defaults"
                                aria-describedby={animationActionStatusId}
                                data-action-state={customDefaultsAction.actionState}
                                data-action-status={customDefaultsAction.actionStatus}
                                onClick={() => {
                                    setCustomFromText(stringifyCustomAnimationObject(DEFAULT_CUSTOM_FROM));
                                    setCustomToText(stringifyCustomAnimationObject(DEFAULT_CUSTOM_TO));
                                    setCustomJsonErrors({});
                                    updateConfig({
                                        from: DEFAULT_CUSTOM_FROM,
                                        to: DEFAULT_CUSTOM_TO,
                                    });
                                }}
                                style={{
                                    marginTop: '10px',
                                    padding: '8px 10px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px',
                                    backgroundColor: '#ffffff',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                Reset custom motion
                            </button>
                        </div>
                    )}

                    {/* Easing */}
                    <div style={styles.section}>
                        <label style={styles.label}>Easing</label>
                        <select
                            style={styles.select}
                            data-testid="editor-animation-easing"
                            aria-describedby={animationActionStatusId}
                            data-action-state={animationEasingAction.actionState}
                            data-action-status={animationEasingAction.actionStatus}
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
                                        data-testid="editor-animation-scroll-start"
                                        aria-describedby={animationActionStatusId}
                                        data-action-state="ready"
                                        data-action-status={`Scroll trigger starts at ${config.scrollTrigger?.start || 'top 80%'}.`}
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
                                        data-testid="editor-animation-scroll-end"
                                        aria-describedby={animationActionStatusId}
                                        data-action-state="ready"
                                        data-action-status={`Scroll trigger ends at ${config.scrollTrigger?.end || 'bottom 20%'}.`}
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
                                    data-testid="editor-animation-scroll-scrub"
                                    aria-describedby={animationActionStatusId}
                                    data-action-state={scrollScrubAction.actionState}
                                    data-action-status={scrollScrubAction.actionStatus}
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
                            type="button"
                            data-testid="editor-animation-preview"
                            aria-describedby={animationActionStatusId}
                            data-action-state={previewAction.actionState}
                            data-action-status={previewAction.actionStatus}
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
                            data-testid="editor-animation-preview-box"
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
