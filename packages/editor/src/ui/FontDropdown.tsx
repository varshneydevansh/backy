import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { cn } from '../utils';

// Default Google Fonts - popular choices
const DEFAULT_FONTS = [
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
}

export const FontDropdown = ({ value, onChange, className }: FontDropdownProps) => {
    const [open, setOpen] = useState(false);
    const [customFonts, setCustomFonts] = useState<string[]>([]);
    const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Load custom fonts from storage on mount
    useEffect(() => {
        setCustomFonts(getCustomFonts());
    }, []);

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

        onChange(fontName);
        setOpen(false);
    };

    // Add custom font
    const handleAddCustom = async () => {
        const fontName = window.prompt('Enter Google Font name (e.g., "Fira Code", "Dancing Script"):');
        if (!fontName?.trim()) return;

        const trimmed = fontName.trim();

        try {
            await loadGoogleFont(trimmed);
            addCustomFont(trimmed);
            setCustomFonts(prev => [...prev, trimmed]);
            setLoadedFonts(prev => new Set([...prev, trimmed]));
            onChange(trimmed);
            setOpen(false);
        } catch (err) {
            alert(`Could not load font "${trimmed}". Please check the font name is correct.`);
        }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };

        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    // Current display value
    const displayValue = value || 'Inter';

    return (
        <div ref={dropdownRef} className={cn("relative", className)}>
            {/* Trigger Button */}
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(!open);
                }}
                className="flex items-center gap-1 px-2 py-1 h-7 text-xs font-medium rounded-md hover:bg-muted/80 border border-border/50 min-w-[100px] justify-between"
                style={{ fontFamily: displayValue }}
            >
                <span className="truncate max-w-[80px]">{displayValue}</span>
                <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
            </button>

            {/* Dropdown Menu */}
            {open && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-popover rounded-lg shadow-lg border border-border z-50 py-1 max-h-72 overflow-auto animate-in fade-in zoom-in-95 duration-100">
                    {/* System Fonts Section */}
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        System Fonts
                    </div>
                    {SYSTEM_FONTS.map((font) => (
                        <button
                            key={font.name}
                            type="button"
                            className="w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                            style={{ fontFamily: font.name }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelect(font.name);
                            }}
                        >
                            <span>{font.name}</span>
                            {value === font.name && <Check className="w-3 h-3" />}
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
                            className="w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                            style={{ fontFamily: loadedFonts.has(font.name) ? font.name : 'inherit' }}
                            onMouseEnter={() => handleFontHover(font.name)}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelect(font.name);
                            }}
                        >
                            <span>{font.name}</span>
                            {value === font.name && <Check className="w-3 h-3" />}
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
                                    className="w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                                    style={{ fontFamily: fontName }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(fontName);
                                    }}
                                >
                                    <span>{fontName}</span>
                                    {value === fontName && <Check className="w-3 h-3" />}
                                </button>
                            ))}
                        </>
                    )}

                    <div className="h-px bg-border my-1" />

                    {/* Add Custom Font Button */}
                    <button
                        type="button"
                        className="w-full px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 text-primary"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddCustom();
                        }}
                    >
                        <Plus className="w-3 h-3" />
                        Add Custom Font...
                    </button>
                </div>
            )}
        </div>
    );
};

export default FontDropdown;
