import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { X } from 'lucide-react';

interface EmojiPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (emoji: string) => void;
    position?: { x: number; y: number };
}

export function EmojiPickerModal({ isOpen, onClose, onSelect, position }: EmojiPickerModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-[1px]"
            onClick={onClose}
        >
            <div
                className="relative bg-background rounded-xl shadow-2xl border border-border overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                style={position ? { position: 'absolute', left: position.x, top: position.y } : {}}
            >
                <EmojiPicker
                    onEmojiClick={(emojiData: EmojiClickData) => {
                        onSelect(emojiData.emoji);
                        onClose();
                    }}
                    width={350}
                    height={450}
                    lazyLoadEmojis={true}

                />
            </div>
        </div>
    );
}
