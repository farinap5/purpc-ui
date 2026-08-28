import React, {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type DetailsHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TableHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "../../utils/cn";

type DivProps = HTMLAttributes<HTMLDivElement>;

export const DesktopWindow = forwardRef<HTMLDivElement, DivProps>(function DesktopWindow(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn("desktop-window", className)} {...props} />;
});

interface WindowTitleBarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  titleId?: string;
}

export function WindowTitleBar({ title, subtitle, onClose, titleId, className, ...props }: WindowTitleBarProps) {
  return (
    <header className={cn("window-title-bar", className)} {...props}>
      <div className="window-title-spacer" aria-hidden="true" />
      <div className="window-title-copy">
        <h2 id={titleId}>{title}</h2>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {onClose ? (
        <CompactIconButton type="button" onClick={onClose} aria-label="Close window" title="Close" autoFocus>
          <X aria-hidden="true" />
        </CompactIconButton>
      ) : <div className="window-title-spacer" aria-hidden="true" />}
    </header>
  );
}

interface DesktopModalProps extends Omit<DivProps, "title"> {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  width?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function DesktopModal({
  title,
  subtitle,
  onClose,
  width = "780px",
  footer,
  children,
  className,
  ...props
}: DesktopModalProps) {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="desktop-modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("desktop-modal", className)}
        style={{ "--desktop-modal-width": width } as React.CSSProperties}
        {...props}
      >
        <WindowTitleBar title={title} subtitle={subtitle} onClose={onClose} titleId={titleId} />
        <div className="desktop-modal-content">{children}</div>
        {footer ? <footer className="desktop-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export type CompactButtonVariant = "default" | "primary" | "secondary" | "danger" | "ghost";

interface CompactButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CompactButtonVariant;
}

export const CompactButton = forwardRef<HTMLButtonElement, CompactButtonProps>(function CompactButton(
  { className, variant = "default", ...props },
  ref
) {
  return <button ref={ref} className={cn("compact-button", `compact-button--${variant}`, className)} {...props} />;
});

export const CompactIconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function CompactIconButton({ className, ...props }, ref) {
    return <button ref={ref} className={cn("compact-icon-button", className)} {...props} />;
  }
);

export const CompactInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function CompactInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn("compact-input", className)} {...props} />;
  }
);

export const CompactNumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function CompactNumberInput({ className, type = "number", ...props }, ref) {
    return <input ref={ref} type={type} className={cn("compact-input compact-number-input", className)} {...props} />;
  }
);

export const CompactTextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function CompactTextArea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn("compact-textarea", className)} {...props} />;
  }
);

export const CompactSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function CompactSelect({ className, children, ...props }, ref) {
    return (
      <span className={cn("compact-select-shell", className)}>
        <select ref={ref} {...props}>{children}</select>
        <span className="compact-select-arrow" aria-hidden="true"><ChevronDown /></span>
      </span>
    );
  }
);

export const CompactCheckbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function CompactCheckbox({ className, type = "checkbox", ...props }, ref) {
    return <input ref={ref} type={type} className={cn("compact-check", className)} {...props} />;
  }
);

export const CompactRadio = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function CompactRadio({ className, type = "radio", ...props }, ref) {
    return <input ref={ref} type={type} className={cn("compact-check", className)} {...props} />;
  }
);

interface CompactFormRowProps extends DivProps {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}

export function CompactFormRow({ label, htmlFor, required, hint, children, className, ...props }: CompactFormRowProps) {
  return (
    <div className={cn("compact-form-row", className)} {...props}>
      <label htmlFor={htmlFor}>{required ? <span aria-hidden="true">*</span> : null}{label}</label>
      <div className="compact-form-control">
        {children}
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  );
}

export function CompactFormGrid({ className, ...props }: DivProps) {
  return <div className={cn("compact-form-grid", className)} {...props} />;
}

export function TabStrip({ className, ...props }: DivProps) {
  return <div role="tablist" className={cn("tab-strip", className)} {...props} />;
}

export function Toolbar({ className, ...props }: DivProps) {
  return <div role="toolbar" className={cn("desktop-toolbar", className)} {...props} />;
}

interface ToolbarDropdownProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  open?: boolean;
}

export function ToolbarDropdown({ className, open, children, ...props }: ToolbarDropdownProps) {
  return (
    <CompactButton className={cn("toolbar-dropdown", open && "is-active", className)} aria-expanded={open} {...props}>
      {children}<ChevronDown aria-hidden="true" />
    </CompactButton>
  );
}

export function SplitPane({ className, ...props }: DivProps) {
  return <div className={cn("split-pane", className)} {...props} />;
}

export function DesktopPanel({ className, ...props }: DivProps) {
  return <section className={cn("desktop-panel", className)} {...props} />;
}

interface PanelHeaderProps extends HTMLAttributes<HTMLElement> {
  actions?: ReactNode;
}

export function PanelHeader({ className, actions, children, ...props }: PanelHeaderProps) {
  return (
    <header className={cn("panel-header", className)} {...props}>
      <span>{children}</span>
      {actions ? <span className="panel-header-actions">{actions}</span> : null}
    </header>
  );
}

export const DataGrid = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  function DataGrid({ className, ...props }, ref) {
    return <table ref={ref} className={cn("data-grid", className)} {...props} />;
  }
);

export const LogConsole = forwardRef<HTMLDivElement, DivProps>(function LogConsole(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn("log-console compact-scrollbar", className)} {...props} />;
});

export function StatusBar({ className, ...props }: DivProps) {
  return <div role="status" className={cn("status-bar", className)} {...props} />;
}

export const CompactScrollbar = forwardRef<HTMLDivElement, DivProps>(function CompactScrollbar(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn("compact-scrollbar", className)} {...props} />;
});

interface CollapsibleSectionProps extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: ReactNode;
}

export function CollapsibleSection({ title, children, className, ...props }: CollapsibleSectionProps) {
  return (
    <details className={cn("collapsible-section", className)} {...props}>
      <summary>{title}</summary>
      <div className="collapsible-section-content">{children}</div>
    </details>
  );
}
