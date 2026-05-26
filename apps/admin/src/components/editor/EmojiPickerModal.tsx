import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent } from 'react';

const COMMON_EMOJIS = [
  { emoji: '\u{2B50}', label: 'star' },
  { emoji: '\u{2705}', label: 'check mark' },
  { emoji: '\u{1F680}', label: 'rocket' },
  { emoji: '\u{1F4A1}', label: 'light bulb' },
  { emoji: '\u{1F525}', label: 'fire' },
  { emoji: '\u{1F389}', label: 'party popper' },
  { emoji: '\u{1F4CC}', label: 'pin' },
  { emoji: '\u{1F4AF}', label: 'hundred points' },
];

const EMOJI_PICKER_ACTION_STATUS_ID = 'editor-emoji-picker-action-status';
const EMOJI_PICKER_TITLE_ID = 'editor-emoji-picker-title';
const EMOJI_PICKER_ACTION_STATUS = `${COMMON_EMOJIS.length} quick emoji options and the full emoji library are ready.`;

interface EmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  position?: { x: number; y: number };
  closeOnSelect?: boolean;
}

const calculatePickerFrame = (position?: { x: number; y: number }) => {
  if (typeof window === 'undefined') {
    return {
      width: 360,
      height: 430,
      left: position?.x,
      top: position?.y,
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const availableWidth = Math.max(1, viewportWidth - 24);
  const availableHeight = Math.max(1, viewportHeight - 24);
  const width = Math.min(380, availableWidth);
  const height = Math.min(500, availableHeight);

  if (!position) {
    return {
      width,
      height,
      left: undefined,
      top: undefined,
    };
  }

  const maxLeft = Math.max(12, viewportWidth - width - 12);
  const left = Math.min(Math.max(12, position.x), maxLeft);
  const desiredTop = position.y + 6;
  const openBelow = desiredTop + height < viewportHeight - 12;
  const top = openBelow
    ? Math.min(Math.max(12, desiredTop), Math.max(12, viewportHeight - height - 12))
    : Math.max(12, viewportHeight - height - 12);

  return {
    width,
    height,
    left,
    top,
  };
};

export function EmojiPickerModal({
  isOpen,
  onClose,
  onSelect,
  position,
  closeOnSelect = true,
}: EmojiPickerModalProps) {
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const hasPosition = Boolean(position);
  const frame = calculatePickerFrame(position);
  const pickerStyle: CSSProperties = hasPosition
    ? {
      left: frame.left,
      top: frame.top,
    }
    : {};
  const pickerContainerStyle: CSSProperties = {
    width: frame.width,
    height: frame.height,
    maxHeight: hasPosition ? `${frame.height}px` : '80vh',
  };
  const fullPickerHeight = Math.max(180, frame.height - 116);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') {
      return;
    }

    event.stopPropagation();
    onClose();
  };

  const handleSelectEmoji = (emoji: string) => {
    onSelect(emoji);
    if (closeOnSelect) {
      onClose();
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[10000]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={EMOJI_PICKER_TITLE_ID}
      aria-describedby={EMOJI_PICKER_ACTION_STATUS_ID}
      tabIndex={-1}
      data-testid="editor-emoji-picker-modal"
      data-action-state="ready"
      data-action-status={EMOJI_PICKER_ACTION_STATUS}
      onKeyDown={handleDialogKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-auto"
        data-testid="editor-emoji-picker-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      />
      <div
        className="absolute flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl pointer-events-auto"
        data-emoji-picker-modal="true"
        style={{
          ...pickerStyle,
          ...pickerContainerStyle,
          position: 'absolute',
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <h2 id={EMOJI_PICKER_TITLE_ID} className="truncate text-sm font-semibold text-foreground">
              Emoji
            </h2>
            <p className="text-xs text-muted-foreground">Insert into the selected rich text.</p>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close emoji picker"
            aria-describedby={EMOJI_PICKER_ACTION_STATUS_ID}
            aria-keyshortcuts="Escape"
            data-testid="editor-emoji-picker-close"
            data-action-state="ready"
            data-action-status="Close emoji picker and keep the current rich-text selection."
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <span
          id={EMOJI_PICKER_ACTION_STATUS_ID}
          className="sr-only"
          data-testid="editor-emoji-picker-action-status"
          aria-live="polite"
        >
          {EMOJI_PICKER_ACTION_STATUS}
        </span>
        <div
          className="border-b border-border bg-muted/40 p-2"
          role="group"
          aria-label="Quick emoji options"
          aria-describedby={EMOJI_PICKER_ACTION_STATUS_ID}
          data-testid="editor-emoji-common-options"
          data-action-state="ready"
          data-action-status={EMOJI_PICKER_ACTION_STATUS}
          data-option-count={COMMON_EMOJIS.length}
        >
          <div className="grid grid-cols-8 gap-1">
            {COMMON_EMOJIS.map((option, index) => (
              <button
                key={option.label}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={`Pick ${option.label} emoji`}
                aria-describedby={EMOJI_PICKER_ACTION_STATUS_ID}
                data-testid={`editor-emoji-option-${index}`}
                data-emoji={option.emoji}
                data-action-state="ready"
                data-action-status={`Insert ${option.label} emoji into rich text.`}
                onClick={() => {
                  handleSelectEmoji(option.emoji);
                }}
              >
                {option.emoji}
              </button>
            ))}
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto"
          data-testid="editor-emoji-library"
          aria-label="Full emoji library"
          data-action-state="ready"
          data-action-status="Full emoji library ready."
        >
          <EmojiPicker
            onEmojiClick={(emojiData: EmojiClickData) => {
              handleSelectEmoji(emojiData.emoji);
            }}
            width={Math.max(1, frame.width - 10)}
            height={fullPickerHeight}
            lazyLoadEmojis={true}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
