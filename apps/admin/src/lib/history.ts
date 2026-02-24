/**
 * ==========================================================================
 * Undo/Redo Command System
 * ==========================================================================
 *
 * Command pattern implementation for undo/redo functionality.
 * Supports element operations: add, delete, move, resize, style changes.
 *
 * @module EditorHistory
 */

import type { CanvasElement } from '../types/editor';

// ==========================================================================
// TYPES
// ==========================================================================

/** Command types for all editor operations */
export type CommandType =
    | 'ADD_ELEMENT'
    | 'DELETE_ELEMENT'
    | 'MOVE_ELEMENT'
    | 'RESIZE_ELEMENT'
    | 'UPDATE_PROPS'
    | 'UPDATE_STYLES'
    | 'DUPLICATE_ELEMENT'
    | 'REORDER_ELEMENT'
    | 'GROUP_ELEMENTS'
    | 'UNGROUP_ELEMENTS'
    | 'BATCH';

/** Base command interface */
export interface Command {
    type: CommandType;
    timestamp: number;
    description: string;
}

/** Add element command */
export interface AddElementCommand extends Command {
    type: 'ADD_ELEMENT';
    element: CanvasElement;
    parentId?: string;
}

/** Delete element command */
export interface DeleteElementCommand extends Command {
    type: 'DELETE_ELEMENT';
    element: CanvasElement;
    parentId?: string;
    index: number;
}

/** Move element command */
export interface MoveElementCommand extends Command {
    type: 'MOVE_ELEMENT';
    elementId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
}

/** Resize element command */
export interface ResizeElementCommand extends Command {
    type: 'RESIZE_ELEMENT';
    elementId: string;
    from: { width: number; height: number; x: number; y: number };
    to: { width: number; height: number; x: number; y: number };
}

/** Update props command */
export interface UpdatePropsCommand extends Command {
    type: 'UPDATE_PROPS';
    elementId: string;
    from: Record<string, unknown>;
    to: Record<string, unknown>;
}

/** Update styles command */
export interface UpdateStylesCommand extends Command {
    type: 'UPDATE_STYLES';
    elementId: string;
    from: React.CSSProperties;
    to: React.CSSProperties;
}

/** Reorder element command */
export interface ReorderElementCommand extends Command {
    type: 'REORDER_ELEMENT';
    elementId: string;
    fromIndex: number;
    toIndex: number;
}

/** Batch command (multiple commands as one undo step) */
export interface BatchCommand extends Command {
    type: 'BATCH';
    commands: AnyCommand[];
}

/** Union of all command types */
export type AnyCommand =
    | AddElementCommand
    | DeleteElementCommand
    | MoveElementCommand
    | ResizeElementCommand
    | UpdatePropsCommand
    | UpdateStylesCommand
    | ReorderElementCommand
    | BatchCommand;

// ==========================================================================
// HISTORY MANAGER
// ==========================================================================

export interface HistoryState {
    undoStack: AnyCommand[];
    redoStack: AnyCommand[];
    maxSize: number;
}

export interface HistoryManager {
    /** Execute a command and add to history */
    execute: (command: AnyCommand) => void;

    /** Undo the last command */
    undo: () => AnyCommand | null;

    /** Redo the last undone command */
    redo: () => AnyCommand | null;

    /** Check if undo is available */
    canUndo: () => boolean;

    /** Check if redo is available */
    canRedo: () => boolean;

    /** Clear all history */
    clear: () => void;

    /** Get current state */
    getState: () => HistoryState;

    /** Get undo stack size */
    undoCount: () => number;

    /** Get redo stack size */
    redoCount: () => number;
}

/**
 * Create a history manager instance
 *
 * @param maxSize - Maximum number of commands to store (default: 50)
 * @param onExecute - Callback when command is executed
 * @param onUndo - Callback when command is undone
 * @param onRedo - Callback when command is redone
 */
export function createHistoryManager(
    maxSize = 50,
    onExecute?: (command: AnyCommand) => void,
    onUndo?: (command: AnyCommand) => void,
    onRedo?: (command: AnyCommand) => void
): HistoryManager {
    let undoStack: AnyCommand[] = [];
    let redoStack: AnyCommand[] = [];

    return {
        execute(command: AnyCommand) {
            // Add to undo stack
            undoStack.push(command);

            // Trim if exceeds max size
            if (undoStack.length > maxSize) {
                undoStack.shift();
            }

            // Clear redo stack on new action
            redoStack = [];

            // Notify
            onExecute?.(command);
        },

        undo(): AnyCommand | null {
            const command = undoStack.pop();
            if (!command) return null;

            redoStack.push(command);
            onUndo?.(command);

            return command;
        },

        redo(): AnyCommand | null {
            const command = redoStack.pop();
            if (!command) return null;

            undoStack.push(command);
            onRedo?.(command);

            return command;
        },

        canUndo(): boolean {
            return undoStack.length > 0;
        },

        canRedo(): boolean {
            return redoStack.length > 0;
        },

        clear() {
            undoStack = [];
            redoStack = [];
        },

        getState(): HistoryState {
            return {
                undoStack: [...undoStack],
                redoStack: [...redoStack],
                maxSize,
            };
        },

        undoCount(): number {
            return undoStack.length;
        },

        redoCount(): number {
            return redoStack.length;
        },
    };
}

// ==========================================================================
// COMMAND EXECUTORS
// ==========================================================================

/**
 * Apply a command to elements array (forward execution)
 */
export function applyCommand(
    elements: CanvasElement[],
    command: AnyCommand
): CanvasElement[] {
    switch (command.type) {
        case 'ADD_ELEMENT':
            return [...elements, command.element];

        case 'DELETE_ELEMENT':
            return elements.filter((el) => el.id !== command.element.id);

        case 'MOVE_ELEMENT':
            return elements.map((el) =>
                el.id === command.elementId
                    ? { ...el, x: command.to.x, y: command.to.y }
                    : el
            );

        case 'RESIZE_ELEMENT':
            return elements.map((el) =>
                el.id === command.elementId
                    ? {
                        ...el,
                        x: command.to.x,
                        y: command.to.y,
                        width: command.to.width,
                        height: command.to.height,
                    }
                    : el
            );

        case 'UPDATE_PROPS':
            return elements.map((el) =>
                el.id === command.elementId
                    ? { ...el, props: { ...el.props, ...command.to } }
                    : el
            );

        case 'UPDATE_STYLES':
            return elements.map((el) =>
                el.id === command.elementId
                    ? { ...el, styles: { ...el.styles, ...command.to } }
                    : el
            );

        case 'REORDER_ELEMENT': {
            const newElements = [...elements];
            const [removed] = newElements.splice(command.fromIndex, 1);
            newElements.splice(command.toIndex, 0, removed);
            return newElements;
        }

        case 'BATCH':
            return command.commands.reduce(
                (acc, cmd) => applyCommand(acc, cmd),
                elements
            );

        default:
            return elements;
    }
}

/**
 * Reverse a command (for undo)
 */
export function reverseCommand(
    elements: CanvasElement[],
    command: AnyCommand
): CanvasElement[] {
    switch (command.type) {
        case 'ADD_ELEMENT':
            return elements.filter((el) => el.id !== command.element.id);

        case 'DELETE_ELEMENT': {
            const newElements = [...elements];
            newElements.splice(command.index, 0, command.element);
            return newElements;
        }

        case 'MOVE_ELEMENT':
            return elements.map((el) =>
                el.id === command.elementId
                    ? { ...el, x: command.from.x, y: command.from.y }
                    : el
            );

        case 'RESIZE_ELEMENT':
            return elements.map((el) =>
                el.id === command.elementId
                    ? {
                        ...el,
                        x: command.from.x,
                        y: command.from.y,
                        width: command.from.width,
                        height: command.from.height,
                    }
                    : el
            );

        case 'UPDATE_PROPS':
            return elements.map((el) =>
                el.id === command.elementId
                    ? { ...el, props: { ...el.props, ...command.from } }
                    : el
            );

        case 'UPDATE_STYLES':
            return elements.map((el) =>
                el.id === command.elementId
                    ? { ...el, styles: { ...el.styles, ...command.from } }
                    : el
            );

        case 'REORDER_ELEMENT': {
            const newElements = [...elements];
            const [removed] = newElements.splice(command.toIndex, 1);
            newElements.splice(command.fromIndex, 0, removed);
            return newElements;
        }

        case 'BATCH':
            // Reverse batch commands in reverse order
            return [...command.commands].reverse().reduce(
                (acc, cmd) => reverseCommand(acc, cmd),
                elements
            );

        default:
            return elements;
    }
}

// ==========================================================================
// COMMAND FACTORIES
// ==========================================================================

/**
 * Create an add element command
 */
export function createAddCommand(
    element: CanvasElement,
    parentId?: string
): AddElementCommand {
    return {
        type: 'ADD_ELEMENT',
        element,
        parentId,
        timestamp: Date.now(),
        description: `Add ${element.type}`,
    };
}

/**
 * Create a delete element command
 */
export function createDeleteCommand(
    element: CanvasElement,
    index: number,
    parentId?: string
): DeleteElementCommand {
    return {
        type: 'DELETE_ELEMENT',
        element,
        index,
        parentId,
        timestamp: Date.now(),
        description: `Delete ${element.type}`,
    };
}

/**
 * Create a move element command
 */
export function createMoveCommand(
    elementId: string,
    from: { x: number; y: number },
    to: { x: number; y: number }
): MoveElementCommand {
    return {
        type: 'MOVE_ELEMENT',
        elementId,
        from,
        to,
        timestamp: Date.now(),
        description: 'Move element',
    };
}

/**
 * Create a resize element command
 */
export function createResizeCommand(
    elementId: string,
    from: { width: number; height: number; x: number; y: number },
    to: { width: number; height: number; x: number; y: number }
): ResizeElementCommand {
    return {
        type: 'RESIZE_ELEMENT',
        elementId,
        from,
        to,
        timestamp: Date.now(),
        description: 'Resize element',
    };
}

/**
 * Create an update props command
 */
export function createUpdatePropsCommand(
    elementId: string,
    from: Record<string, unknown>,
    to: Record<string, unknown>
): UpdatePropsCommand {
    return {
        type: 'UPDATE_PROPS',
        elementId,
        from,
        to,
        timestamp: Date.now(),
        description: 'Update properties',
    };
}

/**
 * Create a batch command
 */
export function createBatchCommand(
    commands: AnyCommand[],
    description: string
): BatchCommand {
    return {
        type: 'BATCH',
        commands,
        timestamp: Date.now(),
        description,
    };
}

export default createHistoryManager;
