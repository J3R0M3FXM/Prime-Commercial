"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

export function AdminTopbar({
  title,
  section,
  onBack,
  actions,
}: {
  title: string;
  section?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-topbar sticky top-0 z-50">
      <div className="admin-topbar__inner">
        <div className="admin-topbar__identity">
          {onBack ? (
            <button type="button" className="admin-icon-button" onClick={onBack} aria-label="Back">
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          ) : null}
          <div className="admin-brandmark" aria-hidden="true">P</div>
          <div className="min-w-0">
            <div className="admin-eyebrow">{section || "PRIME CONTROL"}</div>
            <h1 className="admin-topbar__title">{title}</h1>
          </div>
        </div>
        {actions ? <div className="admin-topbar__actions">{actions}</div> : null}
      </div>
    </header>
  );
}

export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  count,
  actions,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  count?: string | number;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div className="min-w-0 flex-1">
        <div className="admin-page-header__title-row">
          {Icon ? <span className="admin-icon-box"><Icon className="h-4 w-4" /></span> : null}
          <h2 className="admin-page-title">{title}</h2>
          {count !== undefined ? <span className="admin-count">{count}</span> : null}
        </div>
        {description ? <p className="admin-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </div>
  );
}

export function AdminSection({
  title,
  eyebrow,
  description,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="admin-section">
      <button
        type="button"
        className="admin-section__header"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="admin-section__title-wrap">
          {Icon ? <span className="admin-icon-box admin-icon-box--muted"><Icon className="h-4 w-4" /></span> : null}
          <div className="min-w-0 text-left">
            {eyebrow ? <div className="admin-eyebrow">{eyebrow}</div> : null}
            <h3 className="admin-section__title">{title}</h3>
            {description ? <p className="admin-section__description">{description}</p> : null}
          </div>
        </div>
        <span className="admin-section__chevron">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
      </button>
      {open ? <div className="admin-section__body">{children}</div> : null}
    </section>
  );
}

export function AdminStat({
  label,
  value,
  detail,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  icon?: LucideIcon;
}) {
  return (
    <div className={`admin-stat admin-stat--${tone}`}>
      <div className="admin-stat__top">
        <span>{label}</span>
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function AdminToolbar({ children }: { children: ReactNode }) {
  return <div className="admin-toolbar">{children}</div>;
}

export function AdminDisclosure({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="admin-disclosure">
      <button type="button" className="admin-disclosure__trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="min-w-0 flex-1 text-left">
          <span className="admin-disclosure__title">{title}</span>
          {meta ? <span className="admin-disclosure__meta">{meta}</span> : null}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open ? <div className="admin-disclosure__content">{children}</div> : null}
    </div>
  );
}

export function AdminSwitch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`admin-switch-row ${disabled ? "is-disabled" : ""}`}
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span className="min-w-0 flex-1 text-left">
        <span className="admin-switch-row__label">{label}</span>
        {description ? <span className="admin-switch-row__description">{description}</span> : null}
      </span>
      <span className={`admin-switch ${checked ? "is-on" : ""}`} aria-hidden="true"><span /></span>
    </button>
  );
}

export function AdminRadioGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="admin-radio-group">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label key={option.value} className={`admin-radio-option ${selected ? "is-selected" : ""}`}>
            <input type="radio" checked={selected} onChange={() => onChange(option.value)} />
            <span className="admin-radio-dot" aria-hidden="true" />
            <span className="min-w-0">
              <strong>{option.label}</strong>
              {option.description ? <small>{option.description}</small> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function AdminCheckbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className={`admin-checkbox ${checked ? "is-checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="admin-checkbox__mark" aria-hidden="true" />
      <span className="min-w-0">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function AdminEmptyState({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty">
      {Icon ? <span className="admin-empty__icon"><Icon className="h-5 w-5" /></span> : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function AdminSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`admin-surface ${className}`}>{children}</div>;
}

export function AdminBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  return <span className={`admin-badge admin-badge--${tone}`}>{children}</span>;
}
