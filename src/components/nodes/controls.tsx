'use client';

import { type ReactNode, type InputHTMLAttributes } from 'react';
import { theme } from '@/lib/theme';
import { RotateCcw, Check, ChevronDown } from 'lucide-react';
import * as Select from '@radix-ui/react-select';

// ── Number Input ──
// Matches Imagine: h-32, rounded-xl, text-base, centered, no spinner
interface NodeNumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'style'> {
  variant?: 'default' | 'narrow' | 'wide';
}

export function NodeNumberInput({ variant = 'default', className = '', ...props }: NodeNumberInputProps) {
  const spec = variant === 'narrow' ? theme.control.numberNarrow
    : variant === 'wide' ? theme.control.numberWide
    : theme.control.numberInput;

  return (
    <input
      type="number"
      className={`text-white text-center focus:outline-none focus:border-zinc-500 nodrag [&::-webkit-inner-spin-button]:appearance-none ${className}`}
      style={{
        backgroundColor: theme.surface2,
        border: 'none',
        height: spec.height,
        width: spec.width,
        borderRadius: spec.radius,
        padding: `${spec.paddingY}px ${spec.paddingX}px`,
        fontSize: spec.fontSize,
      }}
      {...props}
    />
  );
}

// ── Select ──
// Custom Radix-based dropdown matching Imagine.art's popup design
interface NodeSelectOption {
  value: string;
  label: string;
}

interface NodeSelectProps {
  options: readonly NodeSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

export function NodeSelect({ options, value, onValueChange, fullWidth, disabled, className = '' }: NodeSelectProps) {
  const spec = theme.control.select;
  const selectedLabel = options.find(o => o.value === String(value))?.label ?? value;

  return (
    <Select.Root value={String(value)} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        className={`node-select-trigger flex items-center justify-between text-white nodrag outline-none ${fullWidth ? 'flex-1 min-w-0' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
        style={{
          backgroundColor: theme.surface2,
          height: spec.height,
          borderRadius: spec.radius,
          padding: `${spec.paddingY}px ${spec.paddingX}px`,
          fontSize: spec.fontSize,
          border: `1px solid ${theme.border2}`,
          transition: 'border-color 0.2s ease',
        }}
      >
        <Select.Value>{selectedLabel}</Select.Value>
        <Select.Icon className="node-select-chevron">
          <ChevronDown size={14} className="text-zinc-400 ml-1 shrink-0" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Content
        className="nodrag"
        position="popper"
        sideOffset={4}
        style={{
          backgroundColor: theme.surface2,
          borderRadius: 16,
          padding: 8,
          border: `1px solid ${theme.border2}`,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          zIndex: 50,
          minWidth: 'var(--radix-select-trigger-width)',
          maxHeight: 300,
          overflow: 'auto',
        }}
      >
        <Select.Viewport>
          {options.map((opt) => (
            <Select.Item
              key={opt.value}
              value={opt.value}
              className="flex items-center gap-2 text-white outline-none cursor-pointer select-none"
              style={{
                height: 40,
                padding: '10px',
                borderRadius: 16,
                fontSize: 16,
                lineHeight: '20px',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = theme.surfaceHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <Select.ItemIndicator className="shrink-0">
                <Check size={16} className="text-zinc-400" />
              </Select.ItemIndicator>
              <Select.ItemText>{opt.label}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.Viewport>
      </Select.Content>
    </Select.Root>
  );
}

// ── Slider ──
// Matches Imagine: h-4 track, 16px thumb, filled portion white
interface NodeSliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'style'> {}

export function NodeSlider({ className = '', value, min, max, ...props }: NodeSliderProps) {
  const numVal = Number(value ?? 0);
  const numMin = Number(min ?? 0);
  const numMax = Number(max ?? 100);
  const pct = ((numVal - numMin) / (numMax - numMin)) * 100;
  // Center point as percentage (where 0 falls on -100..100 range)
  const centerPct = ((0 - numMin) / (numMax - numMin)) * 100;
  const hasCenter = numMin < 0 && numMax > 0;

  let bg: string;
  if (hasCenter) {
    // Fill from center to thumb
    const lo = Math.min(centerPct, pct);
    const hi = Math.max(centerPct, pct);
    bg = `linear-gradient(to right, #333 ${lo}%, #fff ${lo}%, #fff ${hi}%, #333 ${hi}%)`;
  } else {
    bg = `linear-gradient(to right, #fff ${pct}%, #333 ${pct}%)`;
  }

  return (
    <input
      type="range"
      className={`flex-1 nodrag node-slider ${className}`}
      style={{ background: bg }}
      value={value}
      min={min}
      max={max}
      {...props}
    />
  );
}

// ── Icon Button ──
// Matches Imagine: 32x32, rounded-xl
interface NodeIconButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  active?: boolean;
  className?: string;
}

export function NodeIconButton({ children, onClick, title, active, className = '' }: NodeIconButtonProps) {
  const spec = theme.control.iconBtn;
  return (
    <button
      className={`flex items-center justify-center transition-colors nodrag ${
        active ? 'text-white' : 'text-zinc-400 hover:text-white'
      } ${className}`}
      style={{
        width: spec.size,
        height: spec.size,
        borderRadius: spec.radius,
        backgroundColor: active ? theme.surfaceHover : undefined,
      }}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      title={title}
    >
      {children}
    </button>
  );
}

// ── Reset Button ──
// Matches Imagine: h-28, rounded-[10px], text-xs
interface NodeResetButtonProps {
  onClick: (e: React.MouseEvent) => void;
  label?: string;
}

export function NodeResetButton({ onClick, label = 'Reset' }: NodeResetButtonProps) {
  const spec = theme.control.resetBtn;
  return (
    <button
      className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors nodrag"
      style={{
        height: spec.height,
        borderRadius: spec.radius,
        padding: `${spec.paddingY}px ${spec.paddingX}px`,
        fontSize: spec.fontSize,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
    >
      <RotateCcw size={12} /> {label}
    </button>
  );
}

// ── Control Label ──
// Consistent label for controls (e.g. "W", "H", "Type", "Size")
export function NodeLabel({ children, width }: { children: ReactNode; width?: number }) {
  return (
    <span
      className="text-zinc-500 shrink-0"
      style={{
        fontSize: theme.font.label.size,
        fontWeight: theme.font.label.weight,
        letterSpacing: theme.font.label.letterSpacing,
        width: width ? width : undefined,
      }}
    >
      {children}
    </span>
  );
}

// ── Controls Row ──
// Standard horizontal layout for a row of controls
export function NodeControlsRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center self-stretch ${className}`} style={{ gap: theme.control.gap, marginTop: 12 }}>
      {children}
    </div>
  );
}
