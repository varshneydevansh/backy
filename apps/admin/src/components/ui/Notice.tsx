import { type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type NoticeTone = 'info' | 'success' | 'warning' | 'error';

interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<NoticeTone, string> = {
  info: 'border-info/25 bg-info/10 text-info',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  error: 'border-destructive/25 bg-destructive/10 text-destructive',
};

const toneIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
} satisfies Record<NoticeTone, typeof Info>;

export function Notice({ tone = 'info', title, children, className }: NoticeProps) {
  const Icon = toneIcons[tone];

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', toneClasses[tone], className)}>
      <Icon className="mt-0.5 size-4 flex-shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className={cn(title && 'mt-1')}>{children}</div>
      </div>
    </div>
  );
}
