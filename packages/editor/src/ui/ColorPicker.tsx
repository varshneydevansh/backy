import React, { useState, useRef, useEffect } from 'react';
import { Palette } from 'lucide-react';
import { cn } from '../utils';

// Popular colors organized by hue
const COLOR_PALETTE = [
    // Row 1: Blacks & Grays
    ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
    // Row 2: Reds & Pinks
    ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
    // Row 3: Lighter versions
    ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
    // Row 4: Medium versions
    ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
    // Row 5: Darker versions
    ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
    // Row 6: Darkest
    ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
];

export interface ColorPickerProps {
    value?: string;
    onChange: (color: string) => void;
    className?: string;
    icon?: React.ReactNode;
    tooltip?: string;
}

export const ColorPicker = ({ value, onChange, className, icon, tooltip }: ColorPickerProps) => {
    const [open, setOpen] = useState(false);
    const [customColor, setCustomColor] = useState(value || '#000000');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };

        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const handleColorSelect = (color: string) => {
        onChange(color);
        setOpen(false);
    };

    const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const color = e.target.value;
        setCustomColor(color);
        onChange(color);
    };

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            {/* Trigger Button */}
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(!open);
                }}
                className="p-1.5 rounded-md hover:bg-muted/80 transition-all flex items-center justify-center h-7 w-7 relative"
                title={tooltip}
            >
                {icon || <Palette className="w-4 h-4" />}
                {/* Color indicator bar */}
                <div
                    className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded-full"
                    style={{ backgroundColor: value || '#000000' }}
                />
            </button>

            {/* Color Picker Popover */}
            {open && (
                <div className="absolute left-0 top-full mt-1 bg-popover rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
                    {/* Color Grid */}
                    <div className="space-y-0.5">
                        {COLOR_PALETTE.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex gap-0.5">
                                {row.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={cn(
                                            "w-5 h-5 rounded-sm border border-border/30 hover:scale-110 transition-transform",
                                            value === color && "ring-2 ring-primary ring-offset-1"
                                        )}
                                        style={{ backgroundColor: color }}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleColorSelect(color);
                                        }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className="h-px bg-border my-2" />

                    {/* Custom Color Input */}
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={customColor}
                            onChange={handleCustomColorChange}
                            className="w-7 h-7 p-0 border-0 rounded cursor-pointer"
                        />
                        <input
                            type="text"
                            value={customColor}
                            onChange={(e) => {
                                setCustomColor(e.target.value);
                                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                                    onChange(e.target.value);
                                }
                            }}
                            className="flex-1 h-7 px-2 text-xs border rounded-md bg-background"
                            placeholder="#000000"
                        />
                    </div>

                    {/* Clear Button */}
                    <button
                        type="button"
                        className="w-full mt-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onChange('');
                            setOpen(false);
                        }}
                    >
                        Clear Color
                    </button>
                </div>
            )}
        </div>
    );
};

export default ColorPicker;
