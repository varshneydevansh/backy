import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DEFAULT_MAX_TAGS = 24;

export const normalizeTagValues = (tags: string[], maxTags = DEFAULT_MAX_TAGS): string[] => {
  const seen = new Set<string>();

  return tags
    .flatMap((tag) => tag.split(/[,\n]/g))
    .map((tag) => tag.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, maxTags);
};

export const parseTagInput = (value: string, maxTags = DEFAULT_MAX_TAGS): string[] => (
  normalizeTagValues(value.split(/[,\n]/g), maxTags)
);

export const serializeTagValues = (tags: string[], maxTags = DEFAULT_MAX_TAGS): string => (
  normalizeTagValues(tags, maxTags).join(', ')
);

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  ariaLabel: string;
  maxTags?: number;
  className?: string;
  disabled?: boolean;
}

export function TagInput({
  tags,
  onChange,
  placeholder,
  ariaLabel,
  maxTags = DEFAULT_MAX_TAGS,
  className,
  disabled = false,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const normalizedTags = normalizeTagValues(tags, maxTags);

  const commitDraft = () => {
    const nextTags = normalizeTagValues([...normalizedTags, draft], maxTags);
    if (nextTags.length !== normalizedTags.length || nextTags.some((tag, index) => tag !== normalizedTags[index])) {
      onChange(nextTags);
    }
    setDraft('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(normalizedTags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
      return;
    }

    if (event.key === 'Backspace' && draft.length === 0 && normalizedTags.length > 0) {
      onChange(normalizedTags.slice(0, -1));
    }
  };

  return (
    <div className={cn(
      'rounded-lg border border-border bg-background px-2.5 py-2 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15',
      className,
    )}
    >
      {normalizedTags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {normalizedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-border bg-muted/70 px-2 text-xs font-medium text-foreground"
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        disabled={disabled || normalizedTags.length >= maxTags}
        className="min-h-8 w-full border-0 bg-transparent px-0 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={normalizedTags.length >= maxTags ? 'Maximum tags reached' : placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}
