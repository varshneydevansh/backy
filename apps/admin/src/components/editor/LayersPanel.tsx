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

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Box,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    Code2,
    Columns3,
    Component,
    Copy,
    CornerUpLeft,
    Eye,
    EyeOff,
    FormInput,
    GripVertical,
    Heading1,
    Image as ImageIcon,
    Keyboard,
    Link,
    List,
    Lock,
    Map,
    MessageSquare,
    Minus,
    MousePointerClick,
    MoveRight,
    Navigation,
    PanelTop,
    Pencil,
    Pilcrow,
    Quote,
    Radio,
    Rows3,
    Square,
    TextCursorInput,
    Trash2,
    Type as TypeIcon,
    Unlock,
    Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
type LayerScope = 'all' | 'selected' | 'hidden' | 'locked' | 'nested';

interface LayerPanelStats {
    total: number;
    hidden: number;
    locked: number;
    nested: number;
    groups: number;
}

const parseLayerBoolean = (value: unknown, fallback = false): boolean => {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value !== 0;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
            return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
            return false;
        }
    }

    return fallback;
};

const isLayerHidden = (element: Pick<CanvasElement, 'visible'>): boolean => (
    parseLayerBoolean(element.visible, true) === false
);

const isLayerLocked = (element: Pick<CanvasElement, 'locked'>): boolean => (
    parseLayerBoolean(element.locked, false)
);

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
// ELEMENT TYPE ICONS
// ==========================================================================

const LAYER_TYPE_ICONS: Record<string, LucideIcon> = {
    box: Box,
    button: MousePointerClick,
    checkbox: CheckSquare,
    codeComponent: Code2,
    columns: Columns3,
    comment: MessageSquare,
    container: Box,
    dataBinding: Link,
    'data-binding': Link,
    dataRef: Link,
    divider: Minus,
    embed: Code2,
    footer: PanelTop,
    form: FormInput,
    header: PanelTop,
    heading: Heading1,
    icon: Component,
    image: ImageIcon,
    input: TextCursorInput,
    interactiveFigure: Component,
    link: Link,
    list: List,
    map: Map,
    nav: Navigation,
    paragraph: Pilcrow,
    quote: Quote,
    radio: Radio,
    repeater: Rows3,
    section: PanelTop,
    select: List,
    spacer: Rows3,
    text: TypeIcon,
    textarea: Keyboard,
    video: Video,
};

const LAYER_SCOPE_OPTIONS: Array<{ id: LayerScope; label: string; icon: LucideIcon }> = [
    { id: 'all', label: 'All', icon: List },
    { id: 'selected', label: 'Selected', icon: CheckSquare },
    { id: 'hidden', label: 'Hidden', icon: EyeOff },
    { id: 'locked', label: 'Locked', icon: Lock },
    { id: 'nested', label: 'Nested', icon: Rows3 },
];

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

const getLayerScopeCount = (
    scope: LayerScope,
    stats: LayerPanelStats,
    selectedCount: number,
): number => {
    switch (scope) {
        case 'selected':
            return selectedCount;
        case 'hidden':
            return stats.hidden;
        case 'locked':
            return stats.locked;
        case 'nested':
            return stats.nested;
        case 'all':
        default:
            return stats.total;
    }
};

const getLayerScopeLabel = (scope: LayerScope): string => (
    LAYER_SCOPE_OPTIONS.find((option) => option.id === scope)?.label || 'All'
);

const LAYER_PANEL_ACTION_STATUS_ID = 'editor-layer-panel-action-status';

const sanitizeLayerDomId = (id: string): string => (
    id.replace(/[^a-zA-Z0-9_-]/g, '-')
);

const getLayerRowActionStatusId = (id: string): string => (
    `editor-layer-row-action-status-${sanitizeLayerDomId(id)}`
);

const getLayerActionState = (
    disabledReason?: string,
    selected = false,
): 'ready' | 'blocked' | 'selected' => {
    if (disabledReason) {
        return 'blocked';
    }
    return selected ? 'selected' : 'ready';
};

const getLayerPanelActionProps = (
    status: string,
    disabledReason?: string,
    selected = false,
) => ({
    'aria-describedby': LAYER_PANEL_ACTION_STATUS_ID,
    'data-action-state': getLayerActionState(disabledReason, selected),
    'data-action-status': status,
    'data-disabled-reason': disabledReason || undefined,
});

const getLayerRowActionProps = (
    statusId: string,
    status: string,
    disabledReason?: string,
) => ({
    'aria-describedby': statusId,
    'data-action-state': getLayerActionState(disabledReason),
    'data-action-status': status,
    'data-disabled-reason': disabledReason || undefined,
});

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
    const renameInputRef = useRef<HTMLInputElement | null>(null);
    const hasExternalSelection = selectedIds.some((id) => id !== element.id);
    const canNestSelectedHere = !disabled && !isLocked && canAcceptChildren && hasExternalSelection;
    const showRowActions = showActions || isSelected;
    const actionButtonTabIndex = showRowActions ? 0 : -1;
    const LayerTypeIcon = LAYER_TYPE_ICONS[element.type] || Square;
    const layerActionStatusId = getLayerRowActionStatusId(element.id);

    const disabledPanelReason = disabled ? 'Layer editing is disabled.' : undefined;
    const lockedReason = isLocked ? `Unlock ${layerName} before using this layer action.` : undefined;
    const expandDisabledReason = disabledPanelReason || (!hasChildren ? `${layerName} has no child layers.` : undefined);
    const mutationDisabledReason = disabledPanelReason || lockedReason;
    const nestDisabledReason = disabledPanelReason
        || lockedReason
        || (!canAcceptChildren ? `${layerName} cannot contain child layers.` : undefined)
        || (!hasExternalSelection ? `Select another layer before nesting into ${layerName}.` : undefined);
    const layerRowActionStatus = [
        `${layerName} layer actions.`,
        isSelected ? 'Layer is selected.' : 'Layer is not selected.',
        isHidden ? 'Layer is hidden.' : 'Layer is visible.',
        isLocked ? 'Layer is locked.' : 'Layer is unlocked.',
    ].join(' ');

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

    const commitRename = (submittedName?: string) => {
        if (disabled || isLocked) {
            setIsRenaming(false);
            setDraftLayerName(layerName);
            return;
        }

        const nextName = (submittedName ?? renameInputRef.current?.value ?? draftLayerName).trim();
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
            aria-describedby={layerActionStatusId}
            data-layer-id={element.id}
            data-layer-depth={depth}
            data-layer-selected={isSelected ? 'true' : 'false'}
            data-action-status={layerRowActionStatus}
            data-action-state={getLayerActionState(disabledPanelReason, isSelected)}
            data-disabled-reason={disabledPanelReason || undefined}
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
                {...getLayerRowActionProps(
                    layerActionStatusId,
                    hasChildren
                        ? `${isExpanded ? 'Collapse' : 'Expand'} ${layerName} child layers.`
                        : `${layerName} has no child layers.`,
                    expandDisabledReason,
                )}
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
            <span
                style={{ cursor: !disabled && canReorder ? 'grab' : 'default', color: '#9ca3af', opacity: !disabled && canReorder ? 1 : 0.35 }}
                data-testid="editor-layer-drag-handle"
                aria-hidden="true"
            >
                <GripVertical size={14} strokeWidth={2} />
            </span>

            {/* Element type icon */}
            <span
                role="img"
                aria-label={`${element.type} layer type`}
                title={`${element.type} layer`}
                data-testid="editor-layer-type-icon"
                data-layer-type={element.type}
                style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '4px',
                    color: '#4b5563',
                    flex: '0 0 auto',
                }}
            >
                <LayerTypeIcon size={14} strokeWidth={1.8} aria-hidden="true" focusable="false" />
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
                        ref={renameInputRef}
                        type="text"
                        value={draftLayerName}
                        onChange={(e) => setDraftLayerName(e.target.value)}
                        onInput={(e) => setDraftLayerName(e.currentTarget.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onBlur={(e) => commitRename(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commitRename(e.currentTarget.value);
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
            <span id={layerActionStatusId} className="sr-only" data-testid="editor-layer-row-action-status" aria-live="polite">
                {layerRowActionStatus}
            </span>
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    opacity: showRowActions ? 1 : 0,
                    pointerEvents: showRowActions ? 'auto' : 'none',
                    transition: 'opacity 0.15s',
                }}
                data-layer-actions-visible={showRowActions ? 'true' : 'false'}
                data-action-status={layerRowActionStatus}
                data-action-state={getLayerActionState(disabledPanelReason)}
                data-disabled-reason={disabledPanelReason || undefined}
                aria-describedby={layerActionStatusId}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `Move ${layerName} up in the layer stack.`,
                        mutationDisabledReason,
                    )}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `Move ${layerName} down in the layer stack.`,
                        mutationDisabledReason,
                    )}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `Move ${layerName} out of its parent layer.`,
                        mutationDisabledReason,
                    )}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `Move selected layers into ${layerName}.`,
                        nestDisabledReason,
                    )}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `${isHidden ? 'Show' : 'Hide'} ${layerName}.`,
                        disabledPanelReason,
                    )}
                    aria-label={`${isHidden ? 'Show' : 'Hide'} ${layerName}`}
                    style={iconButtonStyle(!disabled)}
                    title={isHidden ? 'Show' : 'Hide'}
                >
                    {isHidden ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `${isLocked ? 'Unlock' : 'Lock'} ${layerName}.`,
                        disabledPanelReason,
                    )}
                    aria-label={`${isLocked ? 'Unlock' : 'Lock'} ${layerName}`}
                    style={iconButtonStyle(!disabled)}
                    title={isLocked ? 'Unlock' : 'Lock'}
                >
                    {isLocked ? <Lock size={14} strokeWidth={2} /> : <Unlock size={14} strokeWidth={2} />}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `Rename ${layerName}.`,
                        mutationDisabledReason,
                    )}
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `Duplicate ${layerName}.`,
                        mutationDisabledReason,
                    )}
                    aria-label={`Duplicate ${layerName}`}
                    style={iconButtonStyle(!disabled && !isLocked)}
                    title={isLocked ? 'Unlock to duplicate' : 'Duplicate'}
                >
                    <Copy size={14} strokeWidth={2} />
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
                    {...getLayerRowActionProps(
                        layerActionStatusId,
                        `Delete ${layerName}.`,
                        mutationDisabledReason,
                    )}
                    aria-label={`Delete ${layerName}`}
                    style={iconButtonStyle(!disabled && !isLocked, true)}
                    title={isLocked ? 'Unlock to delete' : 'Delete'}
                >
                    <Trash2 size={14} strokeWidth={2} />
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
    const [layerScope, setLayerScope] = useState<LayerScope>('all');
    const collapsedLayerIdSet = useMemo(() => new Set(collapsedLayerIds), [collapsedLayerIds]);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const layerStats = useMemo(() => {
        const stats: LayerPanelStats = {
            total: 0,
            hidden: 0,
            locked: 0,
            nested: 0,
            groups: 0,
        };

        const collect = (items: CanvasElement[], depth = 0) => {
            items.forEach((element) => {
                stats.total += 1;
                if (isLayerHidden(element)) {
                    stats.hidden += 1;
                }
                if (isLayerLocked(element)) {
                    stats.locked += 1;
                }
                if (depth > 0) {
                    stats.nested += 1;
                }
                if (element.children?.length) {
                    stats.groups += 1;
                    collect(element.children, depth + 1);
                }
            });
        };

        collect(elements);
        return stats;
    }, [elements]);
    const collapsibleLayerIds = useMemo(() => {
        const ids: string[] = [];
        const collect = (items: CanvasElement[]) => {
            items.forEach((element) => {
                if (element.children?.length) {
                    ids.push(element.id);
                    collect(element.children);
                }
            });
        };
        collect(elements);
        return ids;
    }, [elements]);
    const normalizedLayerSearch = layerSearch.trim().toLowerCase();
    const hasActiveLayerFilter = Boolean(normalizedLayerSearch) || layerScope !== 'all';
    const filteredLayerIdSet = useMemo(() => {
        if (!hasActiveLayerFilter) {
            return null;
        }

        const visibleIds = new Set<string>();
        const addDescendants = (element: CanvasElement) => {
            element.children?.forEach((child) => {
                visibleIds.add(child.id);
                addDescendants(child);
            });
        };
        const matchesScope = (element: CanvasElement, depth: number) => {
            switch (layerScope) {
                case 'selected':
                    return selectedIdSet.has(element.id);
                case 'hidden':
                    return isLayerHidden(element);
                case 'locked':
                    return isLayerLocked(element);
                case 'nested':
                    return depth > 0;
                case 'all':
                default:
                    return true;
            }
        };
        const walk = (items: CanvasElement[], ancestorIds: string[], depth = 0): boolean => {
            let hasMatch = false;
            items.forEach((element) => {
                const selfMatchesSearch = normalizedLayerSearch
                    ? getLayerSearchText(element).includes(normalizedLayerSearch)
                    : true;
                const selfMatches = selfMatchesSearch && matchesScope(element, depth);
                const childMatches = element.children?.length
                    ? walk(element.children, [...ancestorIds, element.id], depth + 1)
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
    }, [elements, hasActiveLayerFilter, layerScope, normalizedLayerSearch, selectedIdSet]);
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

    useEffect(() => {
        setCollapsedLayerIds((current) => {
            const collapsibleIds = new Set(collapsibleLayerIds);
            const next = current.filter((id) => collapsibleIds.has(id));
            return next.length === current.length ? current : next;
        });
    }, [collapsibleLayerIds]);

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

    const handleExpandAll = useCallback(() => {
        setCollapsedLayerIds([]);
    }, []);

    const handleCollapseAll = useCallback(() => {
        setCollapsedLayerIds(collapsibleLayerIds);
    }, [collapsibleLayerIds]);

    const handleResetLayerFilters = useCallback(() => {
        setLayerSearch('');
        setLayerScope('all');
    }, []);

    const activeLayerScopeLabel = getLayerScopeLabel(layerScope);
    const emptyLayerFilterMessage = normalizedLayerSearch && layerScope !== 'all'
        ? `No ${activeLayerScopeLabel.toLowerCase()} layers match "${layerSearch.trim()}".`
        : normalizedLayerSearch
            ? `No layers match "${layerSearch.trim()}".`
            : layerScope === 'selected'
                ? 'No selected layers.'
                : `No ${activeLayerScopeLabel.toLowerCase()} layers yet.`;
    const layerPanelActionStatus = `Layers panel ready. ${renderedLayerIds.length} of ${layerStats.total} layers shown. ${selectedIds.length} selected.`;
    const clearSearchDisabledReason = layerSearch ? undefined : 'Type a layer search before clearing.';
    const resetLayerFiltersStatus = hasActiveLayerFilter
        ? `Reset active layer filters from ${activeLayerScopeLabel}${normalizedLayerSearch ? ` search "${layerSearch.trim()}"` : ''}.`
        : 'No layer filters are active.';
    const expandAllDisabledReason = collapsedLayerIds.length > 0
        ? undefined
        : collapsibleLayerIds.length === 0
            ? 'No nested layers are available to expand.'
            : 'All nested layers are already expanded.';
    const collapseAllDisabledReason = collapsibleLayerIds.length === 0
        ? 'No nested layers are available to collapse.'
        : collapsedLayerIds.length === collapsibleLayerIds.length
            ? 'All nested layers are already collapsed.'
            : undefined;

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
                        isHidden={isLayerHidden(element)}
                        isLocked={isLayerLocked(element)}
                        isFocusable={!disabled && element.id === (focusedLayerId || selectedIds[0] || renderedLayerIds[0])}
                        isDragTarget={dragTargetId === element.id}
                        hasChildren={hasChildren}
                        isExpanded={isExpanded}
                        canReorder={!disabled && !isLayerLocked(element)}
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
            aria-describedby={LAYER_PANEL_ACTION_STATUS_ID}
            data-action-status={layerPanelActionStatus}
            data-action-state={getLayerActionState(undefined)}
            data-testid="editor-layers-panel"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                backgroundColor: '#ffffff',
                borderLeft: embedded ? '0' : '1px solid #e5e7eb',
            }}
        >
            <span id={LAYER_PANEL_ACTION_STATUS_ID} className="sr-only" data-testid="editor-layer-panel-action-status" aria-live="polite">
                {layerPanelActionStatus}
            </span>

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
                role="group"
                aria-label="Layer search controls"
                aria-describedby={LAYER_PANEL_ACTION_STATUS_ID}
                data-action-status={layerPanelActionStatus}
            >
                <input
                    type="search"
                    value={layerSearch}
                    onChange={(e) => setLayerSearch(e.target.value)}
                    placeholder="Search layers"
                    aria-label="Search layers"
                    data-testid="editor-layer-search"
                    data-layer-search-results={renderedLayerIds.length}
                    {...getLayerPanelActionProps(
                        normalizedLayerSearch
                            ? `Search layers for "${layerSearch.trim()}"; ${renderedLayerIds.length} matches shown.`
                            : `Search all ${layerStats.total} layers by name, type, or id.`,
                    )}
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
                    {...getLayerPanelActionProps(
                        layerSearch ? `Clear layer search "${layerSearch.trim()}".` : 'Layer search is empty.',
                        clearSearchDisabledReason,
                    )}
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

            <div
                style={{
                    borderBottom: '1px solid #e5e7eb',
                    padding: '10px 12px',
                    background: '#f8fafc',
                }}
                    data-testid="editor-layer-summary"
                data-layer-total-count={layerStats.total}
                data-layer-visible-count={renderedLayerIds.length}
                data-layer-selected-count={selectedIds.length}
                data-layer-hidden-count={layerStats.hidden}
                data-layer-locked-count={layerStats.locked}
                data-layer-nested-count={layerStats.nested}
                    data-layer-scope={layerScope}
                    aria-describedby={LAYER_PANEL_ACTION_STATUS_ID}
                    data-action-status={layerPanelActionStatus}
                >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#111827', fontSize: '12px', fontWeight: 700 }}>
                            Layer map
                        </div>
                        <div style={{ color: '#64748b', fontSize: '11px', lineHeight: '16px' }}>
                            {renderedLayerIds.length} shown from {layerStats.total} total
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            gap: '4px',
                            minWidth: '116px',
                            textAlign: 'right',
                            color: '#475569',
                            fontSize: '11px',
                            fontVariantNumeric: 'tabular-nums',
                        }}
                        aria-label="Layer counts"
                        data-testid="editor-layer-counts"
                    >
                        <span title="Selected layers">{selectedIds.length} sel</span>
                        <span title="Hidden layers">{layerStats.hidden} hid</span>
                        <span title="Locked layers">{layerStats.locked} lock</span>
                    </div>
                </div>
                <div
                    style={{
                        display: 'flex',
                        gap: '6px',
                        marginTop: '8px',
                        overflowX: 'auto',
                        paddingBottom: '1px',
                    }}
                    data-testid="editor-layer-scope-controls"
                    role="group"
                    aria-label="Filter layers by state"
                    aria-describedby={LAYER_PANEL_ACTION_STATUS_ID}
                    data-action-status={`Layer scope filters ready. ${renderedLayerIds.length} layers shown.`}
                >
                    {LAYER_SCOPE_OPTIONS.map((option) => {
                        const ScopeIcon = option.icon;
                        const isActive = option.id === layerScope;
                        const count = getLayerScopeCount(option.id, layerStats, selectedIds.length);
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setLayerScope(option.id)}
                                aria-pressed={isActive}
                                data-testid={`editor-layer-scope-${option.id}`}
                                data-layer-scope-active={isActive ? 'true' : 'false'}
                                data-target-scope={option.id}
                                data-matched-layers={count}
                                {...getLayerPanelActionProps(
                                    `Show ${option.label.toLowerCase()} layers. ${count} matching layers available.`,
                                    undefined,
                                    isActive,
                                )}
                                style={{
                                    alignItems: 'center',
                                    background: isActive ? '#0f172a' : '#ffffff',
                                    border: isActive ? '1px solid #0f172a' : '1px solid #dbe3ec',
                                    borderRadius: '7px',
                                    color: isActive ? '#ffffff' : '#475569',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    flexShrink: 0,
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    gap: '5px',
                                    lineHeight: '16px',
                                    padding: '5px 7px',
                                    transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease, transform 120ms ease',
                                }}
                            >
                                <ScopeIcon size={12} strokeWidth={2} aria-hidden="true" focusable="false" />
                                <span>{option.label}</span>
                                <span
                                    style={{
                                        borderRadius: '4px',
                                        background: isActive ? 'rgba(255,255,255,0.16)' : '#f1f5f9',
                                        color: isActive ? '#e2e8f0' : '#64748b',
                                        minWidth: '18px',
                                        padding: '0 4px',
                                        textAlign: 'center',
                                    }}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div
                style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#6b7280',
                }}
                data-testid="editor-layer-tree-controls"
                data-layer-collapsible-count={collapsibleLayerIds.length}
                data-layer-collapsed-count={collapsedLayerIds.length}
                data-layer-filter-active={hasActiveLayerFilter ? 'true' : 'false'}
                role="group"
                aria-label="Layer tree controls"
                aria-describedby={LAYER_PANEL_ACTION_STATUS_ID}
                data-action-status={`Layer tree controls ready. ${collapsibleLayerIds.length} expandable layers, ${collapsedLayerIds.length} collapsed.`}
            >
                <span>
                    {renderedLayerIds.length} shown
                    {hasActiveLayerFilter ? (
                        <span
                            data-testid="editor-layer-active-filter-summary"
                            style={{
                                color: '#475569',
                                fontWeight: 600,
                                marginLeft: '6px',
                            }}
                        >
                            {layerScope === 'all' ? 'Search filter' : activeLayerScopeLabel}
                        </span>
                    ) : null}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {hasActiveLayerFilter ? (
                        <button
                            type="button"
                            onClick={handleResetLayerFilters}
                            data-testid="editor-layer-reset-filters"
                            aria-label="Reset layer filters"
                            {...getLayerPanelActionProps(resetLayerFiltersStatus)}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                background: '#f8fafc',
                                color: '#0f172a',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                padding: '5px 8px',
                            }}
                        >
                            Reset
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleExpandAll}
                        disabled={collapsedLayerIds.length === 0}
                        data-testid="editor-layer-expand-all"
                        aria-label="Expand all layers"
                        {...getLayerPanelActionProps(
                            collapsedLayerIds.length > 0
                                ? `Expand ${collapsedLayerIds.length} collapsed layer groups.`
                                : 'All layer groups are expanded.',
                            expandAllDisabledReason,
                        )}
                        style={{
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            background: '#ffffff',
                            color: collapsedLayerIds.length > 0 ? '#374151' : '#9ca3af',
                            cursor: collapsedLayerIds.length > 0 ? 'pointer' : 'not-allowed',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '5px 8px',
                        }}
                    >
                        Expand all
                    </button>
                    <button
                        type="button"
                        onClick={handleCollapseAll}
                        disabled={collapsibleLayerIds.length === 0 || collapsedLayerIds.length === collapsibleLayerIds.length}
                        data-testid="editor-layer-collapse-all"
                        aria-label="Collapse all layers"
                        {...getLayerPanelActionProps(
                            collapsibleLayerIds.length > 0
                                ? `Collapse ${collapsibleLayerIds.length} expandable layer groups.`
                                : 'No nested layers are available to collapse.',
                            collapseAllDisabledReason,
                        )}
                        style={{
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            background: '#ffffff',
                            color: collapsibleLayerIds.length > 0 && collapsedLayerIds.length !== collapsibleLayerIds.length ? '#374151' : '#9ca3af',
                            cursor: collapsibleLayerIds.length > 0 && collapsedLayerIds.length !== collapsibleLayerIds.length ? 'pointer' : 'not-allowed',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '5px 8px',
                        }}
                    >
                        Collapse all
                    </button>
                </div>
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
                ) : hasActiveLayerFilter && renderedLayerIds.length === 0 ? (
                    <div
                        style={{
                            padding: '24px 16px',
                            textAlign: 'center',
                            color: '#64748b',
                            fontSize: '13px',
                        }}
                        data-testid="editor-layer-filter-empty"
                        data-layer-empty-scope={layerScope}
                        data-layer-empty-search={layerSearch.trim()}
                        aria-describedby={LAYER_PANEL_ACTION_STATUS_ID}
                        data-action-status={emptyLayerFilterMessage}
                    >
                        <div
                            style={{
                                color: '#0f172a',
                                fontWeight: 700,
                                marginBottom: '4px',
                            }}
                        >
                            No matching layers
                        </div>
                        <div
                            style={{
                                lineHeight: '18px',
                                margin: '0 auto 12px',
                                maxWidth: '220px',
                            }}
                        >
                            {emptyLayerFilterMessage}
                        </div>
                        <button
                            type="button"
                            onClick={handleResetLayerFilters}
                            data-testid="editor-layer-empty-reset-filters"
                            aria-label="Reset layer filters"
                            {...getLayerPanelActionProps(resetLayerFiltersStatus)}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                background: '#ffffff',
                                color: '#0f172a',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                padding: '7px 10px',
                            }}
                        >
                            Show all layers
                        </button>
                    </div>
                ) : (
                    renderLayerItems(elements)
                )}
            </div>
        </div>
    );
}

export default LayersPanel;
