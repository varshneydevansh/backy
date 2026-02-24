/**
 * ==========================================================================
 * Layers Panel Component
 * ==========================================================================
 *
 * Shows hierarchical view of canvas elements with:
 * - Drag-to-reorder
 * - Visibility toggle
 * - Lock toggle
 * - Selection & multi-select
 */

import React, { useState, useCallback } from 'react';
import type { CanvasElement } from '../../types/editor';

// ==========================================================================
// TYPES
// ==========================================================================

interface LayersPanelProps {
    elements: CanvasElement[];
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onVisibilityToggle: (id: string) => void;
    onLockToggle: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
}

interface LayerItemProps {
    element: CanvasElement;
    index: number;
    isSelected: boolean;
    isHidden: boolean;
    isLocked: boolean;
    onSelect: (id: string, multiSelect: boolean) => void;
    onDragStart: (index: number) => void;
    onDragOver: (index: number) => void;
    onDragEnd: () => void;
    onVisibilityToggle: (id: string) => void;
    onLockToggle: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    depth?: number;
}

// ==========================================================================
// ICONS (inline SVG for simplicity)
// ==========================================================================

const EyeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

const LockIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const UnlockIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
);

const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const CopyIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const DragIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="8" y2="6" />
        <line x1="16" y1="6" x2="16" y2="6" />
        <line x1="8" y1="12" x2="8" y2="12" />
        <line x1="16" y1="12" x2="16" y2="12" />
        <line x1="8" y1="18" x2="8" y2="18" />
        <line x1="16" y1="18" x2="16" y2="18" />
    </svg>
);

// ==========================================================================
// ELEMENT TYPE ICONS
// ==========================================================================

const ELEMENT_ICONS: Record<string, string> = {
    text: 'T',
    heading: 'H',
    paragraph: '¶',
    image: '🖼',
    video: '▶',
    button: '☐',
    container: '□',
    section: '▭',
    form: '📝',
    input: '⌨',
    divider: '—',
    spacer: '↕',
    embed: '</>',
};

// ==========================================================================
// LAYER ITEM COMPONENT
// ==========================================================================

function LayerItem({
    element,
    index,
    isSelected,
    isHidden,
    isLocked,
    onSelect,
    onDragStart,
    onDragOver,
    onDragEnd,
    onVisibilityToggle,
    onLockToggle,
    onDelete,
    onDuplicate,
    depth = 0,
}: LayerItemProps) {
    const [showActions, setShowActions] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        onSelect(element.id, e.metaKey || e.ctrlKey);
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
    };

    return (
        <div
            className={`layer-item ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden' : ''} ${isLocked ? 'locked' : ''}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                paddingLeft: `${12 + depth * 16}px`,
                gap: '8px',
                backgroundColor: isSelected ? '#e0e7ff' : 'transparent',
                borderBottom: '1px solid #e5e7eb',
                cursor: 'pointer',
                opacity: isHidden ? 0.5 : 1,
                transition: 'background-color 0.15s',
            }}
            onClick={handleClick}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
            draggable
            onDragStart={handleDragStart}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver(index);
            }}
            onDragEnd={onDragEnd}
        >
            {/* Drag handle */}
            <span style={{ cursor: 'grab', color: '#9ca3af' }}>
                <DragIcon />
            </span>

            {/* Element type icon */}
            <span
                style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '4px',
                    fontSize: '12px',
                }}
            >
                {ELEMENT_ICONS[element.type] || '?'}
            </span>

            {/* Element name */}
            <span
                style={{
                    flex: 1,
                    fontSize: '13px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {(element.props.name as string) || `${element.type}-${element.id.slice(0, 4)}`}
            </span>

            {/* Action buttons (shown on hover) */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    opacity: showActions ? 1 : 0,
                    transition: 'opacity 0.15s',
                }}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onVisibilityToggle(element.id);
                    }}
                    style={{
                        padding: '4px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: isHidden ? '#9ca3af' : '#6b7280',
                    }}
                    title={isHidden ? 'Show' : 'Hide'}
                >
                    {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onLockToggle(element.id);
                    }}
                    style={{
                        padding: '4px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: isLocked ? '#6b7280' : '#9ca3af',
                    }}
                    title={isLocked ? 'Unlock' : 'Lock'}
                >
                    {isLocked ? <LockIcon /> : <UnlockIcon />}
                </button>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(element.id);
                    }}
                    style={{
                        padding: '4px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#6b7280',
                    }}
                    title="Duplicate"
                >
                    <CopyIcon />
                </button>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(element.id);
                    }}
                    style={{
                        padding: '4px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                    }}
                    title="Delete"
                >
                    <TrashIcon />
                </button>
            </div>
        </div>
    );
}

// ==========================================================================
// LAYERS PANEL COMPONENT
// ==========================================================================

export function LayersPanel({
    elements,
    selectedIds,
    onSelect,
    onReorder,
    onVisibilityToggle,
    onLockToggle,
    onDelete,
    onDuplicate,
}: LayersPanelProps) {
    const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
    const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
    const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());

    const handleSelect = useCallback(
        (id: string, multiSelect: boolean) => {
            if (multiSelect) {
                if (selectedIds.includes(id)) {
                    onSelect(selectedIds.filter((sid) => sid !== id));
                } else {
                    onSelect([...selectedIds, id]);
                }
            } else {
                onSelect([id]);
            }
        },
        [selectedIds, onSelect]
    );

    const handleDragStart = useCallback((index: number) => {
        setDragFromIndex(index);
    }, []);

    const handleDragOver = useCallback(
        (toIndex: number) => {
            if (dragFromIndex !== null && dragFromIndex !== toIndex) {
                onReorder(dragFromIndex, toIndex);
                setDragFromIndex(toIndex);
            }
        },
        [dragFromIndex, onReorder]
    );

    const handleDragEnd = useCallback(() => {
        setDragFromIndex(null);
    }, []);

    const handleVisibilityToggle = useCallback((id: string) => {
        setHiddenIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
        onVisibilityToggle(id);
    }, [onVisibilityToggle]);

    const handleLockToggle = useCallback((id: string) => {
        setLockedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
        onLockToggle(id);
    }, [onLockToggle]);

    // Reverse elements for display (top elements first in layer order)
    const reversedElements = [...elements].reverse();

    return (
        <div
            className="layers-panel"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                backgroundColor: '#ffffff',
                borderLeft: '1px solid #e5e7eb',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 600,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <span>Layers</span>
                <span
                    style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        fontWeight: 400,
                    }}
                >
                    {elements.length} elements
                </span>
            </div>

            {/* Layer list */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                }}
            >
                {reversedElements.length === 0 ? (
                    <div
                        style={{
                            padding: '24px 16px',
                            textAlign: 'center',
                            color: '#9ca3af',
                            fontSize: '13px',
                        }}
                    >
                        No elements on canvas.
                        <br />
                        Drag components from the library.
                    </div>
                ) : (
                    reversedElements.map((element, index) => (
                        <LayerItem
                            key={element.id}
                            element={element}
                            index={elements.length - 1 - index} // Correct index for reversed order
                            isSelected={selectedIds.includes(element.id)}
                            isHidden={hiddenIds.has(element.id)}
                            isLocked={lockedIds.has(element.id)}
                            onSelect={handleSelect}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDragEnd={handleDragEnd}
                            onVisibilityToggle={handleVisibilityToggle}
                            onLockToggle={handleLockToggle}
                            onDelete={onDelete}
                            onDuplicate={onDuplicate}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

export default LayersPanel;
