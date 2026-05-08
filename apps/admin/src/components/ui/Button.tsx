import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border-border bg-background text-foreground hover:bg-accent',
  ghost: 'border-transparent bg-transparent text-foreground hover:bg-accent',
  danger: 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2 text-sm',
  icon: 'size-10 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'outline',
      size = 'md',
      iconStart,
      iconEnd,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors',
        'focus-ring disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {iconStart}
      {children}
      {iconEnd}
    </button>
  ),
);

Button.displayName = 'Button';
