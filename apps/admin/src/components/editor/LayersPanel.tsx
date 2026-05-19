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

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CornerUpLeft, MoveRight, Pencil } from 'lucide-react';
import type { CanvasElement } from '../../types/editor';

// ==========================================================================
// TYPES
// ==========================================================================

interface LayersPanelProps {
    elements: CanvasElement[];
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onReorder: (fromId: string, toId: string) => void;
    onMove: (id: string, action: LayerMoveAction) => void;
    onNestSelection: (parentId: string) => void;
    onVisibilityToggle: (id: string) => void;
    onLockToggle: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    disabled?: boolean;
    embedded?: boolean;
    hideHeader?: boolean;
}

type LayerMoveAction = 'up' | 'down' | 'outdent';

interface LayerItemProps {
    element: CanvasElement;
    isSelected: boolean;
    isHidden: boolean;
    isLocked: boolean;
    isFocusable: boolean;
    isDragTarget: boolean;
    hasChildren: boolean;
    isExpanded: boolean;
    canReorder: boolean;
    canAcceptChildren: boolean;
    selectedIds: string[];
    onSelect: (id: string, multiSelect: boolean, rangeSelect: boolean) => void;
    onKeyboardNavigate: (id: string, key: string, multiSelect: boolean, rangeSelect: boolean) => void;
    onToggleExpanded: (id: string) => void;
    onDragStart: (id: string) => void;
    onDragOver: (id: string) => void;
    onDrop: (id: string) => void;
    onDragEnd: () => void;
    onMove: (id: string, action: LayerMoveAction) => void;
    onNestSelection: (parentId: string) => void;
    onVisibilityToggle: (id: string) => void;
    onLockToggle: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    disabled?: boolean;
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

const CHILD_ACCEPTING_TYPES = new Set([
    'box',
    'container',
    'section',
    'header',
    'footer',
    'nav',
    'columns',
    'form',
]);

const getLayerDisplayName = (element: CanvasElement): string => (
    element.name
    || (element.props.layerName as string)
    || (element.props.name as string)
    || `${element.type}-${element.id.slice(0, 4)}`
);

const getLayerSearchText = (element: CanvasElement): string => (
    `${getLayerDisplayName(element)} ${element.type} ${element.id}`.toLowerCase()
);

// ==========================================================================
// LAYER ITEM COMPONENT
// ==========================================================================

function LayerItem({
    element,
    isSelected,
    isHidden,
    isLocked,
    isFocusable,
    isDragTarget,
    hasChildren,
    isExpanded,
    canReorder,
    canAcceptChildren,
    selectedIds,
    onSelect,
    onKeyboardNavigate,
    onToggleExpanded,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onMove,
    onNestSelection,
    onVisibilityToggle,
    onLockToggle,
    onRename,
    onDelete,
    onDuplicate,
    disabled = false,
    depth = 0,
}: LayerItemProps) {
    const [showActions, setShowActions] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const layerName = getLayerDisplayName(element);
    const [draftLayerName, setDraftLayerName] = useState(layerName);
    const hasExternalSelection = selectedIds.some((id) => id !== element.id);
    const canNestSelectedHere = !disabled && !isLocked && canAcceptChildren && hasExternalSelection;
    const showRowActions = showActions || isSelected;
    const actionButtonTabIndex = showRowActions ? 0 : -1;

    useEffect(() => {
        if (!isRenaming) {
            setDraftLayerName(layerName);
        }
    }, [isRenaming, layerName]);

    const iconButtonStyle = (active = true, danger = false): React.CSSProperties => ({
        padding: '4px',
        border: 'none',
        background: 'none',
        cursor: active ? 'pointer' : 'not-allowed',
        color: active ? (danger ? '#ef4444' : '#6b7280') : '#cbd5e1',
    });

    const handleClick = (e: React.MouseEvent) => {
        onSelect(element.id, e.metaKey || e.ctrlKey, e.shiftKey);
    };

    const startRenaming = () => {
        if (disabled || isLocked) {
            return;
        }
        setDraftLayerName(layerName);
        setIsRenaming(true);
        onSelect(element.id, false, false);
    };

    const commitRename = () => {
        if (disabled || isLocked) {
            setIsRenaming(false);
            setDraftLayerName(layerName);
            return;
        }

        const nextName = draftLayerName.trim();
        onRename(element.id, nextName);
        setIsRenaming(false);
    };

    const cancelRename = () => {
        setDraftLayerName(layerName);
        setIsRenaming(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(element.id, e.metaKey || e.ctrlKey, e.shiftKey);
            return;
        }

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && hasChildren) {
            const shouldCollapse = e.key === 'ArrowLeft' && isExpanded;
            const shouldExpand = e.key === 'ArrowRight' && !isExpanded;
            if (shouldCollapse || shouldExpand) {
                e.preventDefault();
                onToggleExpanded(element.id);
            }
            return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            onKeyboardNavigate(element.id, e.key, e.metaKey || e.ctrlKey, e.shiftKey);
        }
    };

    const handleDragStart = (e: React.DragEvent) => {
        if (disabled || !canReorder) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(element.id);
    };

    return (
        <div
            className={`layer-item ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden' : ''} ${isLocked ? 'locked' : ''}`}
            role="treeitem"
            tabIndex={disabled || !isFocusable ? -1 : 0}
            aria-selected={isSelected}
            aria-level={depth + 1}
            aria-expanded={hasChildren ? isExpanded : undefined}
            data-layer-id={element.id}
            data-layer-depth={depth}
            data-layer-selected={isSelected ? 'true' : 'false'}
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                paddingLeft: `${12 + depth * 16}px`,
                gap: '8px',
                backgroundColor: isDragTarget ? '#eef2ff' : isSelected ? '#e0e7ff' : 'transparent',
                borderBottom: '1px solid #e5e7eb',
                boxShadow: isDragTarget ? 'inset 0 2px 0 #6366f1' : 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: isHidden ? 0.5 : 1,
                transition: 'background-color 0.15s, box-shadow 0.15s',
            }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
            draggable={!disabled && canReorder}
            onDragStart={handleDragStart}
            onDragOver={(e) => {
                if (disabled || !canReorder) {
                    return;
                }
                e.preventDefault();
                onDragOver(element.id);
            }}
            onDrop={(e) => {
                if (disabled || !canReorder) {
                    return;
                }
                e.preventDefault();
                onDrop(element.id);
            }}
            onDragEnd={onDragEnd}
        >
            <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                    e.stopPropagation();
                    if (disabled || !hasChildren) {
                        return;
                    }
                    onToggleExpanded(element.id);
                }}
                disabled={disabled || !hasChildren}
                data-layer-action="toggle-expand"
                data-layer-action-id={element.id}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${layerName}`}
                style={{
                    ...iconButtonStyle(!disabled && hasChildren),
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: hasChildren ? 1 : 0.35,
                    cursor: !disabled && hasChildren ? 'pointer' : 'default',
                }}
                title={hasChildren ? (isExpanded ? 'Collapse layer' : 'Expand layer') : 'No child layers'}
            >
                {hasChildren ? (
                    isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />
                ) : (
                    <span aria-hidden="true" style={{ width: '14px', height: '14px' }} />
                )}
            </button>

            {/* Drag handle */}
            <span style={{ cursor: !disabled && canReorder ? 'grab' : 'default', color: '#9ca3af', opacity: !disabled && canReorder ? 1 : 0.35 }}>
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
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRenaming();
                }}
            >
                {isRenaming ? (
                    <input
                        type="text"
                        value={draftLayerName}
                        onChange={(e) => setDraftLayerName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commitRename();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelRename();
                            }
                        }}
                        autoFocus
                        data-layer-rename-input={element.id}
                        aria-label={`Rename ${layerName}`}
                        style={{
                            width: '100%',
                            border: '1px solid #6366f1',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '13px',
                            outline: 'none',
                        }}
                    />
                ) : (
                    layerName
                )}
            </span>

            {/* Action buttons (shown on hover) */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    opacity: showRowActions ? 1 : 0,
                    pointerEvents: showRowActions ? 'auto' : 'none',
                    transition: 'opacity 0.15s',
                }}
                data-layer-actions-visible={showRowActions ? 'true' : 'false'}
                aria-hidden={showRowActions ? undefined : true}
            >
                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (disabled || isLocked) {
                            return;
                        }
                        onMove(element.id, 'up');
                    }}
                    disabled={disabled || isLocked}
                    data-layer-action="move-up"
                    data-layer-action-id={element.id}
                    aria-label={`Move ${layerName} up`}
                    style={iconButtonStyle(!disabled && !isLocked)}
                    title={isLocked ? 'Unlock to move' : 'Move up'}
                >
                    <ArrowUp size={14} strokeWidth={2} />
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (disabled || isLocked) {
                            return;
                        }
                        onMove(element.id, 'down');
                    }}
                    disabled={disabled || isLocked}
                    data-layer-action="move-down"
                    data-layer-action-id={element.id}
                    aria-label={`Move ${layerName} down`}
                    style={iconButtonStyle(!disabled && !isLocked)}
                    title={isLocked ? 'Unlock to move' : 'Move down'}
                >
                    <ArrowDown size={14} strokeWidth={2} />
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (disabled || isLocked) {
                            return;
                        }
                        onMove(element.id, 'outdent');
                    }}
                    disabled={disabled || isLocked}
                    data-layer-action="outdent"
                    data-layer-action-id={element.id}
                    aria-label={`Move ${layerName} out`}
                    style={iconButtonStyle(!disabled && !isLocked)}
                    title={isLocked ? 'Unlock to move out' : 'Move out of parent'}
                >
                    <CornerUpLeft size={14} strokeWidth={2} />
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!canNestSelectedHere) {
                            return;
                        }
                        onNestSelection(element.id);
                    }}
                    disabled={!canNestSelectedHere}
                    data-layer-action="nest-selection"
                    data-layer-action-id={element.id}
                    aria-label={`Move selected layers into ${layerName}`}
                    style={iconButtonStyle(canNestSelectedHere)}
                    title={canAcceptChildren ? 'Move selected layers into this layer' : 'This layer cannot contain children'}
                >
                    <MoveRight size={14} strokeWidth={2} />
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (disabled) {
                            return;
                        }
                        onVisibilityToggle(element.id);
                    }}
                    disabled={disabled}
                    data-layer-action="visibility"
                    data-layer-action-id={element.id}
                    aria-label={`${isHidden ? 'Show' : 'Hide'} ${layerName}`}
                    style={iconButtonStyle(!disabled)}
                    title={isHidden ? 'Show' : 'Hide'}
                >
                    {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (disabled) {
                            return;
                        }
                        onLockToggle(element.id);
                    }}
                    disabled={disabled}
                    data-layer-action="lock"
                    data-layer-action-id={element.id}
                    aria-label={`${isLocked ? 'Unlock' : 'Lock'} ${layerName}`}
                    style={iconButtonStyle(!disabled)}
                    title={isLocked ? 'Unlock' : 'Lock'}
                >
                    {isLocked ? <LockIcon /> : <UnlockIcon />}
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        startRenaming();
                    }}
                    disabled={disabled || isLocked}
                    data-layer-action="rename"
                    data-layer-action-id={element.id}
                    aria-label={`Rename ${layerName}`}
                    style={iconButtonStyle(!disabled && !isLocked)}
                    title={isLocked ? 'Unlock to rename' : 'Rename'}
                >
                    <Pencil size={14} strokeWidth={2} />
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (disabled || isLocked) {
                            return;
                        }
                        onDuplicate(element.id);
                    }}
                    disabled={disabled || isLocked}
                    data-layer-action="duplicate"
                    data-layer-action-id={element.id}
                    aria-label={`Duplicate ${layerName}`}
                    style={iconButtonStyle(!disabled && !isLocked)}
                    title={isLocked ? 'Unlock to duplicate' : 'Duplicate'}
                >
                    <CopyIcon />
                </button>

                <button
                    type="button"
                    tabIndex={actionButtonTabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (disabled || isLocked) {
                            return;
                        }
                        onDelete(element.id);
                    }}
                    disabled={disabled || isLocked}
                    data-layer-action="delete"
                    data-layer-action-id={element.id}
                    aria-label={`Delete ${layerName}`}
                    style={iconButtonStyle(!disabled && !isLocked, true)}
                    title={isLocked ? 'Unlock to delete' : 'Delete'}
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
    onMove,
    onNestSelection,
    onVisibilityToggle,
    onLockToggle,
    onRename,
    onDelete,
    onDuplicate,
    disabled = false,
    embedded = false,
    hideHeader = false,
}: LayersPanelProps) {
    const [dragFromId, setDragFromId] = useState<string | null>(null);
    const [dragTargetId, setDragTargetId] = useState<string | null>(null);
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [focusedLayerId, setFocusedLayerId] = useState<string | null>(null);
    const [collapsedLayerIds, setCollapsedLayerIds] = useState<string[]>([]);
    const [layerSearch, setLayerSearch] = useState('');
    const collapsedLayerIdSet = useMemo(() => new Set(collapsedLayerIds), [collapsedLayerIds]);
    const normalizedLayerSearch = layerSearch.trim().toLowerCase();
    const filteredLayerIdSet = useMemo(() => {
        if (!normalizedLayerSearch) {
            return null;
        }

        const visibleIds = new Set<string>();
        const addDescendants = (element: CanvasElement) => {
            element.children?.forEach((child) => {
                visibleIds.add(child.id);
                addDescendants(child);
            });
        };
        const walk = (items: CanvasElement[], ancestorIds: string[]): boolean => {
            let hasMatch = false;
            items.forEach((element) => {
                const selfMatches = getLayerSearchText(element).includes(normalizedLayerSearch);
                const childMatches = element.children?.length
                    ? walk(element.children, [...ancestorIds, element.id])
                    : false;

                if (selfMatches || childMatches) {
                    ancestorIds.forEach((id) => visibleIds.add(id));
                    visibleIds.add(element.id);
                    if (selfMatches) {
                        addDescendants(element);
                    }
                }

                hasMatch = hasMatch || selfMatches || childMatches;
            });
            return hasMatch;
        };

        walk(elements, []);
        return visibleIds;
    }, [elements, normalizedLayerSearch]);
    const renderedLayerIds = useMemo(() => {
        const ids: string[] = [];
        const collect = (items: CanvasElement[]) => {
            [...items].reverse().forEach((element) => {
                if (filteredLayerIdSet && !filteredLayerIdSet.has(element.id)) {
                    return;
                }
                ids.push(element.id);
                if (element.children?.length && (normalizedLayerSearch || !collapsedLayerIdSet.has(element.id))) {
                    collect(element.children);
                }
            });
        };
        collect(elements);
        return ids;
    }, [collapsedLayerIdSet, elements, filteredLayerIdSet, normalizedLayerSearch]);

    const handleSelect = useCallback(
        (id: string, multiSelect: boolean, rangeSelect: boolean) => {
            setFocusedLayerId(id);
            if (rangeSelect && lastSelectedId) {
                const fromIndex = renderedLayerIds.indexOf(lastSelectedId);
                const toIndex = renderedLayerIds.indexOf(id);
                if (fromIndex >= 0 && toIndex >= 0) {
                    const start = Math.min(fromIndex, toIndex);
                    const end = Math.max(fromIndex, toIndex);
                    const rangeIds = renderedLayerIds.slice(start, end + 1);
                    onSelect(multiSelect ? Array.from(new Set([...selectedIds, ...rangeIds])) : rangeIds);
                    return;
                }
            }

            setLastSelectedId(id);
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
        [lastSelectedId, renderedLayerIds, selectedIds, onSelect]
    );

    useEffect(() => {
        if (disabled || renderedLayerIds.length === 0) {
            setFocusedLayerId(null);
            return;
        }

        if (focusedLayerId && renderedLayerIds.includes(focusedLayerId)) {
            return;
        }

        const selectedFocusableId = selectedIds.find((id) => renderedLayerIds.includes(id));
        setFocusedLayerId(selectedFocusableId || renderedLayerIds[0]);
    }, [disabled, focusedLayerId, renderedLayerIds, selectedIds]);

    const focusLayerRow = useCallback((id: string) => {
        const row = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-id]'))
            .find((candidate) => candidate.getAttribute('data-layer-id') === id);
        row?.focus();
    }, []);

    const handleToggleExpanded = useCallback((id: string) => {
        setCollapsedLayerIds((current) => (
            current.includes(id)
                ? current.filter((collapsedId) => collapsedId !== id)
                : [...current, id]
        ));
    }, []);

    const handleKeyboardNavigate = useCallback(
        (id: string, key: string, multiSelect: boolean, rangeSelect: boolean) => {
            const currentIndex = renderedLayerIds.indexOf(id);
            if (currentIndex < 0 || renderedLayerIds.length === 0) {
                return;
            }

            const nextIndex = key === 'Home'
                ? 0
                : key === 'End'
                    ? renderedLayerIds.length - 1
                    : key === 'ArrowUp'
                        ? Math.max(0, currentIndex - 1)
                        : Math.min(renderedLayerIds.length - 1, currentIndex + 1);
            const nextId = renderedLayerIds[nextIndex];
            if (!nextId) {
                return;
            }

            if (rangeSelect) {
                const anchorId = lastSelectedId && renderedLayerIds.includes(lastSelectedId)
                    ? lastSelectedId
                    : id;
                const anchorIndex = renderedLayerIds.indexOf(anchorId);
                const start = Math.min(anchorIndex, nextIndex);
                const end = Math.max(anchorIndex, nextIndex);
                const rangeIds = renderedLayerIds.slice(start, end + 1);
                onSelect(multiSelect ? Array.from(new Set([...selectedIds, ...rangeIds])) : rangeIds);
            } else if (multiSelect) {
                setLastSelectedId(nextId);
                onSelect(selectedIds.includes(nextId) ? selectedIds : [...selectedIds, nextId]);
            } else {
                setLastSelectedId(nextId);
                onSelect([nextId]);
            }

            setFocusedLayerId(nextId);
            focusLayerRow(nextId);
        },
        [focusLayerRow, lastSelectedId, renderedLayerIds, selectedIds, onSelect]
    );

    const handleDragStart = useCallback((id: string) => {
        setDragFromId(id);
        setDragTargetId(null);
    }, []);

    const handleDragOver = useCallback(
        (toId: string) => {
            if (disabled) {
                return;
            }
            setDragTargetId(dragFromId !== null && dragFromId !== toId ? toId : null);
        },
        [disabled, dragFromId]
    );

    const handleDrop = useCallback(
        (toId: string) => {
            if (disabled) {
                return;
            }
            if (dragFromId !== null && dragFromId !== toId) {
                onReorder(dragFromId, toId);
            }
            setDragFromId(null);
            setDragTargetId(null);
        },
        [disabled, dragFromId, onReorder]
    );

    const handleDragEnd = useCallback(() => {
        setDragFromId(null);
        setDragTargetId(null);
    }, []);

    const handleVisibilityToggle = useCallback((id: string) => {
        onVisibilityToggle(id);
    }, [onVisibilityToggle]);

    const handleLockToggle = useCallback((id: string) => {
        onLockToggle(id);
    }, [onLockToggle]);

    const handleRename = useCallback((id: string, name: string) => {
        onRename(id, name);
    }, [onRename]);

    const renderLayerItems = (items: CanvasElement[], depth = 0) => (
        [...items].reverse().map((element) => {
            if (filteredLayerIdSet && !filteredLayerIdSet.has(element.id)) {
                return null;
            }

            const hasChildren = Boolean(element.children?.length);
            const isExpanded = Boolean(normalizedLayerSearch) || !collapsedLayerIdSet.has(element.id);
            return (
                <React.Fragment key={element.id}>
                    <LayerItem
                        element={element}
                        isSelected={selectedIds.includes(element.id)}
                        isHidden={element.visible === false}
                        isLocked={element.locked === true}
                        isFocusable={!disabled && element.id === (focusedLayerId || selectedIds[0] || renderedLayerIds[0])}
                        isDragTarget={dragTargetId === element.id}
                        hasChildren={hasChildren}
                        isExpanded={isExpanded}
                        canReorder={!disabled && element.locked !== true}
                        canAcceptChildren={CHILD_ACCEPTING_TYPES.has(element.type)}
                        selectedIds={selectedIds}
                        disabled={disabled}
                        onSelect={handleSelect}
                        onKeyboardNavigate={handleKeyboardNavigate}
                        onToggleExpanded={handleToggleExpanded}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        onMove={onMove}
                        onNestSelection={onNestSelection}
                        onVisibilityToggle={handleVisibilityToggle}
                        onLockToggle={handleLockToggle}
                        onRename={handleRename}
                        onDelete={onDelete}
                        onDuplicate={onDuplicate}
                        depth={depth}
                    />
                    {hasChildren && isExpanded ? renderLayerItems(element.children || [], depth + 1) : null}
                </React.Fragment>
            );
        })
    );

    return (
        <div
            className={embedded ? 'layers-panel w-full' : 'layers-panel w-[clamp(18rem,24vw,30rem)] min-w-[18rem] max-w-[30rem] shrink-0'}
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                backgroundColor: '#ffffff',
                borderLeft: embedded ? '0' : '1px solid #e5e7eb',
            }}
        >
            {/* Header */}
            {!hideHeader && (
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
            )}

            <div
                style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}
                data-testid="editor-layer-search-controls"
            >
                <input
                    type="search"
                    value={layerSearch}
                    onChange={(e) => setLayerSearch(e.target.value)}
                    placeholder="Search layers"
                    aria-label="Search layers"
                    data-testid="editor-layer-search"
                    data-layer-search-results={renderedLayerIds.length}
                    style={{
                        minWidth: 0,
                        flex: 1,
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '13px',
                        outline: 'none',
                    }}
                />
                <button
                    type="button"
                    onClick={() => setLayerSearch('')}
                    disabled={!layerSearch}
                    aria-label="Clear layer search"
                    data-testid="editor-layer-search-clear"
                    style={{
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        background: '#ffffff',
                        color: layerSearch ? '#374151' : '#9ca3af',
                        cursor: layerSearch ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '6px 8px',
                    }}
                >
                    Clear
                </button>
            </div>

            {/* Layer list */}
            <div
                role="tree"
                aria-label="Canvas layers"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                }}
            >
                {elements.length === 0 ? (
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
                ) : normalizedLayerSearch && renderedLayerIds.length === 0 ? (
                    <div
                        style={{
                            padding: '24px 16px',
                            textAlign: 'center',
                            color: '#9ca3af',
                            fontSize: '13px',
                        }}
                        data-testid="editor-layer-search-empty"
                    >
                        No matching layers.
                    </div>
                ) : (
                    renderLayerItems(elements)
                )}
            </div>
        </div>
    );
}

export default LayersPanel;
