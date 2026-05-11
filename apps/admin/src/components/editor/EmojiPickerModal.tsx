import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { createPortal } from 'react-dom';

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
  const pickerStyle = hasPosition
    ? {
      left: frame.left,
      top: frame.top,
    }
    : {};
  const pickerContainerStyle = {
    width: frame.width,
    height: frame.height,
    maxHeight: hasPosition ? `${frame.height}px` : '80vh',
  };

  const modal = (
    <div
      className="fixed inset-0 z-[10000]"
      role="dialog"
      aria-modal="true"
      aria-label="Emoji picker"
      data-testid="editor-emoji-picker-modal"
    >
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-auto"
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
        className="absolute bg-background rounded-xl shadow-2xl border border-border overflow-hidden pointer-events-auto"
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
        <div className="border-b border-border bg-muted/40 p-2" data-testid="editor-emoji-common-options">
          <div className="grid grid-cols-8 gap-1">
            {COMMON_EMOJIS.map((option, index) => (
              <button
                key={option.label}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={`Pick ${option.label} emoji`}
                data-testid={`editor-emoji-option-${index}`}
                data-emoji={option.emoji}
                onClick={() => {
                  onSelect(option.emoji);
                  if (closeOnSelect) {
                    onClose();
                  }
                }}
              >
                {option.emoji}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[calc(100%-49px)] w-full overflow-auto">
          <EmojiPicker
            onEmojiClick={(emojiData: EmojiClickData) => {
              onSelect(emojiData.emoji);
              if (closeOnSelect) {
                onClose();
              }
            }}
            width={Math.max(1, frame.width - 10)}
            height={Math.max(1, frame.height - 10)}
            lazyLoadEmojis={true}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
