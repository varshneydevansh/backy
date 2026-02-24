/**
 * Rich Text Formatting Panel Container
 * 
 * This component provides the portal container where the PortalToolbar
 * (from inside the Plate context) will render its controls.
 * 
 * The actual toolbar is rendered by BackyEditor's PortalToolbar component
 * using React createPortal into this container.
 */

import { useActiveEditor } from './ActiveEditorContext';
import { cn } from '@/lib/utils';
import {
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Underline,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Palette,
  Highlighter,
  Type,
  Eraser,
  Smile,
  Link,
  Image,
} from 'lucide-react';
import { useState } from 'react';

interface RichTextFormattingProps {
    onOpenMediaLibrary?: () => void;
    onOpenLinkModal?: () => void;
}

export function RichTextFormatting({
  onOpenMediaLibrary,
  onOpenLinkModal,
}: RichTextFormattingProps) {
    const {
      activeEditor,
      toggleMark,
      setAlign,
      toggleList,
      isMarkActive,
      applyMark,
      removeMark,
      storeSelection,
      indentList,
      outdentList,
      insertText,
      insertLink,
      insertImage,
    } = useActiveEditor();

    const canApply = !!activeEditor;
    const quickEmojis = ['😀', '😁', '😍', '🎉', '🔥', '👍', '❤️', '🚀', '🧠', '✅', '📝', '💡'];
    const [showEmojiPalette, setShowEmojiPalette] = useState(false);

    const run = (fn: () => void) => {
      if (!canApply) return;
      storeSelection();
      fn();
    };

    const runMark = (format: string, value?: any) => {
      if (!canApply) return;
      run(() => {
        if (value === undefined || value === '') {
          removeMark(format);
          return;
        }
        applyMark(format, value);
      });
    };

    const clearRichTextFormatting = () => {
      run(() => {
        const marks = [
          'bold',
          'italic',
          'underline',
          'strikethrough',
          'code',
          'color',
          'backgroundColor',
          'fontFamily',
          'fontSize',
          'fontStyle',
          'textDecoration',
        ];
        marks.forEach((mark) => {
          removeMark(mark);
        });
      });
    };

    const insertEmoji = (emoji: string) => {
        if (!canApply) return;
        run(() => insertText(emoji));
        setShowEmojiPalette(false);
    };

    const applyOrOpenLinkAction = () => {
      if (!canApply) return;
      storeSelection();
      if (onOpenLinkModal) {
        onOpenLinkModal();
        return;
      }

      const url = window.prompt('Insert link URL for selected text:');
      if (!url) return;
      const trimmed = url.trim();
      if (!trimmed) return;
      insertLink(trimmed);
    };

    const applyOrOpenMediaAction = () => {
      if (!canApply) return;
      storeSelection();

      if (onOpenMediaLibrary) {
        onOpenMediaLibrary();
        return;
      }

      const url = window.prompt('Insert image URL:');
      if (!url) return;
      const trimmed = url.trim();
      if (!trimmed) return;
      insertImage(trimmed);
    };

    const openEmojiPicker = () => {
      if (!canApply) return;
      storeSelection();
      setShowEmojiPalette((prev) => !prev);
    };

    return (
      <div className={cn("space-y-3 border border-border rounded-lg p-3 bg-card/40 text-xs")}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => toggleMark('bold'));
            }}
            className={cn(
              "w-8 h-8 rounded border border-border grid place-items-center",
              isMarkActive('bold') && canApply ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            )}
            title="Bold"
            disabled={!canApply}
          >
            <Bold className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => toggleMark('italic'));
            }}
            className={cn(
              "w-8 h-8 rounded border border-border grid place-items-center",
              isMarkActive('italic') && canApply ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            )}
            title="Italic"
            disabled={!canApply}
          >
            <Italic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => toggleMark('underline'));
            }}
            className={cn(
              "w-8 h-8 rounded border border-border grid place-items-center",
              isMarkActive('underline') && canApply ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            )}
            title="Underline"
            disabled={!canApply}
          >
            <Underline className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => toggleMark('strikethrough'));
            }}
            className={cn(
              "w-8 h-8 rounded border border-border grid place-items-center",
              isMarkActive('strikethrough') && canApply ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            )}
            title="Strikethrough"
            disabled={!canApply}
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => toggleMark('code'));
            }}
            className={cn(
              "w-8 h-8 rounded border border-border grid place-items-center",
              isMarkActive('code') && canApply ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            )}
            title="Inline code"
            disabled={!canApply}
          >
            <Type className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => setAlign('left'));
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Align left"
            disabled={!canApply}
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => setAlign('center'));
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Align center"
            disabled={!canApply}
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => setAlign('right'));
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Align right"
            disabled={!canApply}
          >
            <AlignRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => toggleList('ul'));
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Bulleted list"
            disabled={!canApply}
          >
              <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => toggleList('ol'));
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Numbered list"
            disabled={!canApply}
          >
              <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => outdentList());
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Outdent list"
            disabled={!canApply}
          >
            <span className="text-[10px]">◀</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run(() => indentList());
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Indent list"
            disabled={!canApply}
          >
            <span className="text-[10px]">▶</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs">
            <Palette className="w-3 h-3" />
            <span className="text-muted-foreground">Selected Font</span>
            <select
              onMouseDown={(e) => e.preventDefault()}
              onChange={(e) => {
                if (e.target.value === 'inherit') {
                  runMark('fontFamily', '');
                  return;
                }
                runMark('fontFamily', e.target.value);
              }}
              className="w-full px-2 py-1.5 text-sm rounded-md border bg-background"
            >
              <option value="inherit">Inherit</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="Times New Roman, serif">Times New Roman</option>
              <option value="Poppins, sans-serif">Poppins</option>
              <option value="Montserrat, sans-serif">Montserrat</option>
              <option value="Playfair Display, serif">Playfair Display</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Type className="w-3 h-3" />
            <span className="text-muted-foreground">Font Size</span>
            <input
              type="number"
              min={8}
              max={120}
              step={1}
              placeholder="px"
              onMouseDown={(e) => e.preventDefault()}
              onBlur={(event) => {
                const value = (event.target as HTMLInputElement).value;
                if (!value) {
                  runMark('fontSize', '');
                  return;
                }
                const size = parseFloat(value);
                if (Number.isFinite(size) && size > 0) {
                  runMark('fontSize', `${Math.round(size)}px`);
                }
              }}
              className="w-full px-2 py-1.5 text-sm rounded-md border bg-background"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              clearRichTextFormatting();
            }}
            className="w-full py-1.5 rounded border border-border hover:bg-accent text-[11px] text-muted-foreground"
            title="Clear selected text formatting"
            disabled={!canApply}
          >
            <Eraser className="w-4 h-4 mr-2 inline" />
            Clear Selection Style
          </button>

          <label className="flex items-center gap-2 text-xs">
            <Palette className="w-3 h-3" />
            <span className="text-muted-foreground">Font</span>
            <input
              type="color"
              disabled={!canApply}
              onMouseDown={(e) => e.preventDefault()}
              onChange={(e) => {
                run(() => applyMark('color', e.target.value));
              }}
              className="w-8 h-7 rounded border border-border"
            />
          </label>
            <label className="flex items-center gap-2 text-xs">
              <Highlighter className="w-3 h-3" />
              <span className="text-muted-foreground">Highlight</span>
            <input
              type="color"
              disabled={!canApply}
              onMouseDown={(e) => e.preventDefault()}
              onChange={(e) => {
                run(() => applyMark('backgroundColor', e.target.value));
              }}
              className="w-8 h-7 rounded border border-border"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <Smile className="w-3 h-3" />
            <span className="text-muted-foreground">Emoji</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                openEmojiPicker();
              }}
              className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
              title="Insert emoji"
              disabled={!canApply}
            >
              <span>😊</span>
            </button>
          </label>
          {showEmojiPalette ? (
            <div className="grid grid-cols-6 gap-1">
              {quickEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertEmoji(emoji);
                  }}
                  className="w-8 h-8 rounded border border-border hover:bg-accent"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyOrOpenMediaAction();
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Insert image"
            disabled={!canApply}
          >
            <Image className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyOrOpenLinkAction();
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Insert link"
            disabled={!canApply}
          >
            <Link className="w-4 h-4" />
          </button>
        </div>

        {!canApply && (
          <p className="text-[11px] text-muted-foreground">
            Open and edit text to enable toolbar.
          </p>
        )}
      </div>
    );
}

export default RichTextFormatting;
