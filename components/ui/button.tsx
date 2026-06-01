import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "outline" | "ghost" | "gold" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-glow hover:bg-blue-400 border border-blue-300/30",
  outline:
    "border border-blue-300/40 text-blue-100 hover:bg-blue-400/10 hover:border-blue-300 shadow-[0_0_24px_rgb(59_130_246/0.14)]",
  ghost: "text-slate-200 hover:bg-white/[0.08] border border-transparent",
  gold: "bg-accent text-slate-950 shadow-gold hover:bg-amber-300 border border-amber-200/30",
  danger:
    "bg-red-500/[0.12] text-red-100 border border-red-400/40 hover:bg-red-500/20",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  icon: "h-10 w-10 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild, children, ...props }, ref) => {
    const classes = cn(
      "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition duration-200 disabled:pointer-events-none disabled:opacity-50",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
      variants[variant],
      sizes[size],
      className,
    );

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        ...props,
        className: cn(classes, child.props.className),
      });
    }

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
