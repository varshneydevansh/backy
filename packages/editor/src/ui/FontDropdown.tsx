import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getToolbarMenuFocusIndex, useToolbarPopoverPosition } from './toolbarPopover';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { cn } from '../utils';

// Default Google Fonts - popular choices
const DEFAULT_FONTS = [
    { name: 'Geist', loaded: false },
    { name: 'Inter', loaded: false },
    { name: 'Roboto', loaded: false },
    { name: 'Open Sans', loaded: false },
    { name: 'Lato', loaded: false },
    { name: 'Montserrat', loaded: false },
    { name: 'Poppins', loaded: false },
    { name: 'Oswald', loaded: false },
    { name: 'Playfair Display', loaded: false },
    { name: 'Merriweather', loaded: false },
    { name: 'Source Sans Pro', loaded: false },
    { name: 'Raleway', loaded: false },
    { name: 'Nunito', loaded: false },
    { name: 'Ubuntu', loaded: false },
    { name: 'Quicksand', loaded: false },
    { name: 'Work Sans', loaded: false },
];

// System fonts (always available)
const SYSTEM_FONTS = [
    { name: 'Arial', loaded: true, system: true },
    { name: 'Georgia', loaded: true, system: true },
    { name: 'Times New Roman', loaded: true, system: true },
    { name: 'Courier New', loaded: true, system: true },
    { name: 'Verdana', loaded: true, system: true },
];

// Load a Google Font dynamically
function loadGoogleFont(fontName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const fontId = `google-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;

        // Check if already loaded
        if (document.getElementById(fontId)) {
            resolve();
            return;
        }

        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap`;

        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load font: ${fontName}`));

        document.head.appendChild(link);
    });
}

// Get stored custom fonts from localStorage
function getCustomFonts(): string[] {
    try {
        const stored = localStorage.getItem('backy-custom-fonts');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

// Store custom font in localStorage
function addCustomFont(fontName: string) {
    const fonts = getCustomFonts();
    if (!fonts.includes(fontName)) {
        fonts.push(fontName);
        localStorage.setItem('backy-custom-fonts', JSON.stringify(fonts));
    }
}

export interface FontDropdownProps {
    value?: string;
    onChange: (fontFamily: string) => void;
    className?: string;
    comfortable?: boolean;
    onBeforeOpen?: () => void;
}

export const FontDropdown = ({ value, onChange, className, comfortable = false, onBeforeOpen }: FontDropdownProps): React.ReactElement => {
    const [open, setOpen] = useState(false);
    const [customFonts, setCustomFonts] = useState<string[]>([]);
    const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());
    const [customInputOpen, setCustomInputOpen] = useState(false);
    const [customFontName, setCustomFontName] = useState('');
    const [customFontError, setCustomFontError] = useState<string | null>(null);
    const [customFontLoading, setCustomFontLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const customInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const keyboardOpenRef = useRef(false);
    const mountedRef = useRef(true);
    const popupStyle = useToolbarPopoverPosition(open, triggerRef, menuRef, 224, 320, 'left');
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
    useEffect(() => {
        if (!open || !keyboardOpenRef.current) return;
        const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
        return () => cancelAnimationFrame(frame);
    }, [open]);

    // Load custom fonts from storage on mount
    useEffect(() => {
        setCustomFonts(getCustomFonts());
    }, []);

    useEffect(() => {
        if (!open) {
            setCustomInputOpen(false);
            setCustomFontName('');
            setCustomFontError(null);
            setCustomFontLoading(false);
        }
    }, [open]);

    useEffect(() => {
        if (open && customInputOpen) {
            customInputRef.current?.focus();
        }
    }, [open, customInputOpen]);

    // Load font when hovering over it (preview)
    const handleFontHover = async (fontName: string) => {
        if (!loadedFonts.has(fontName) && !SYSTEM_FONTS.find(f => f.name === fontName)) {
            try {
                await loadGoogleFont(fontName);
                setLoadedFonts(prev => new Set([...prev, fontName]));
            } catch (err) {
                console.warn('Failed to load font for preview:', fontName);
            }
        }
    };

    // Select font
    const handleSelect = async (fontName: string) => {
        // Load font if not already loaded
        if (!loadedFonts.has(fontName) && !SYSTEM_FONTS.find(f => f.name === fontName)) {
            try {
                await loadGoogleFont(fontName);
                setLoadedFonts(prev => new Set([...prev, fontName]));
            } catch (err) {
                console.error('Failed to load font:', fontName);
            }
        }

        if (mountedRef.current) { onChange(fontName); setOpen(false); }
    };

    // Add custom font
    const handleAddCustom = async () => {

        const trimmed = customFontName.trim();
        if (!trimmed) {
            setCustomFontError('Enter a Google Font name.');
            return;
        }

        try {
            setCustomFontLoading(true);
            setCustomFontError(null);
            await loadGoogleFont(trimmed);
            if (!mountedRef.current) return;
            addCustomFont(trimmed);
            setCustomFonts(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
            setLoadedFonts(prev => new Set([...prev, trimmed]));
            onChange(trimmed);
            setOpen(false);
        } catch (err) {
            setCustomFontError(`Could not load "${trimmed}". Check the Google Font name.`);
        } finally {
            setCustomFontLoading(false);
        }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };

        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    // Current display value
    const displayValue = value === 'inherit' ? 'Site font' : value || 'Inter';
    const fontFamily = value === 'inherit' ? 'inherit' : displayValue;
    const itemClass = cn('w-full px-3 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', comfortable ? 'min-h-11 py-2' : 'py-1.5');

    return (
        <div ref={dropdownRef} className={cn("relative", className)}>
            {/* Trigger Button */}
            <button ref={triggerRef}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onBeforeOpen?.(); }}
                onClick={(event) => { onBeforeOpen?.(); keyboardOpenRef.current = event.detail === 0; setOpen(!open); }}
                onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'ArrowDown') { event.preventDefault(); onBeforeOpen?.(); keyboardOpenRef.current = true; setOpen(true); } }}
                aria-label="Font family" aria-haspopup="menu" aria-expanded={open}
                className={cn('flex items-center gap-1 px-2 text-xs font-medium rounded-md hover:bg-muted/80 border border-border/50 justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', comfortable ? 'min-h-11 w-28' : 'py-1 h-7 min-w-[100px]')}
                style={{ fontFamily }}
            >
                <span className="truncate max-w-[80px]">{displayValue}</span>
                <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
            </button>

            {/* Dropdown Menu */}
            {open && typeof document !== 'undefined' && createPortal(
                <div ref={menuRef} role="menu" aria-label="Font family options" style={popupStyle} onKeyDown={(event) => {
                    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); dropdownRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
                    if (!(event.target instanceof HTMLInputElement) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
                        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                        const next = getToolbarMenuFocusIndex(event.key, index, buttons.length);
                        if (next !== null) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
                    }
                }} className="ignore-click-outside/toolbar bg-popover rounded-lg shadow-lg border border-border py-1">
                    <button type="button" role="menuitem" className={itemClass} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange('inherit'); setOpen(false); }}>Site font</button>
                    {/* System Fonts Section */}
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        System Fonts
                    </div>
                    {SYSTEM_FONTS.map((font) => (
                        <button
                            key={font.name}
                            type="button"
                            role="menuitem" className={itemClass}
                            style={{ fontFamily: font.name }}
                            onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(font.name)}
                        >
                            <span style={{ whiteSpace: 'nowrap' }}>{font.name}</span>
                            {value === font.name && <Check className="w-3 h-3 shrink-0" />}
                        </button>
                    ))}

                    <div className="h-px bg-border my-1" />

                    {/* Google Fonts Section */}
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Google Fonts
                    </div>
                    {DEFAULT_FONTS.map((font) => (
                        <button
                            key={font.name}
                            type="button"
                            role="menuitem" className={itemClass}
                            style={{ fontFamily: loadedFonts.has(font.name) ? font.name : 'inherit' }}
                            onMouseEnter={() => handleFontHover(font.name)}
                            onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(font.name)}
                        >
                            <span style={{ whiteSpace: 'nowrap' }}>{font.name}</span>
                            {value === font.name && <Check className="w-3 h-3 shrink-0" />}
                        </button>
                    ))}

                    {/* Custom Fonts Section */}
                    {customFonts.length > 0 && (
                        <>
                            <div className="h-px bg-border my-1" />
                            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Custom Fonts
                            </div>
                            {customFonts.map((fontName) => (
                                <button
                                    key={fontName}
                                    type="button"
                                    role="menuitem" className={itemClass}
                                    style={{ fontFamily: fontName }}
                                    onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(fontName)}
                                >
                                    <span style={{ whiteSpace: 'nowrap' }}>{fontName}</span>
                                    {value === fontName && <Check className="w-3 h-3 shrink-0" />}
                                </button>
                            ))}
                        </>
                    )}

                    <div className="h-px bg-border my-1" />

                    {customInputOpen ? (
                        <div role="group" aria-label="Custom font"
                            className="px-2 py-2 space-y-2"
                            data-testid="backy-editor-font-custom-form"
                            onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void handleAddCustom(); } }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <input
                                ref={customInputRef}
                                type="text"
                                value={customFontName}
                                onChange={(event) => {
                                    setCustomFontName(event.target.value);
                                    setCustomFontError(null);
                                }}
                                placeholder="Google Font name"
                                aria-label="Google Font name" className={cn("w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring", comfortable ? "min-h-11" : "h-8")}
                                data-testid="backy-editor-font-custom-input"
                            />
                            {customFontError && (
                                <div
                                    className="text-[11px] leading-snug text-destructive"
                                    data-testid="backy-editor-font-custom-error"
                                >
                                    {customFontError}
                                </div>
                            )}
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className={cn("rounded-md px-2 text-xs hover:bg-accent", comfortable ? "min-h-11" : "h-7")}
                                    data-testid="backy-editor-font-custom-cancel"
                                    onClick={() => {
                                        setCustomInputOpen(false);
                                        setCustomFontName('');
                                        setCustomFontError(null);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleAddCustom()}
                                    className={cn("rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-60", comfortable ? "min-h-11" : "h-7")}
                                    data-testid="backy-editor-font-custom-submit"
                                    disabled={customFontLoading}
                                >
                                    {customFontLoading ? 'Adding...' : 'Add'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            role="menuitem"
                            className={cn("w-full px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 text-primary", comfortable && "min-h-11")}
                            data-testid="backy-editor-font-custom-open"
                            onMouseDown={(e) => {
                                e.preventDefault();
                            }}
                            onClick={() => {
                                setCustomInputOpen(true);
                                setCustomFontName('');
                                setCustomFontError(null);
                            }}
                        >
                            <Plus className="w-3 h-3 shrink-0" />
                            Add Custom Font...
                        </button>
                    )}
                </div>, document.body
            )}
        </div>
    );
};

export default FontDropdown;
