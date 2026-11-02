import { memo, useState, useEffect } from 'react';

function formatQty(n: number, maxDecimals = 3): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(n * factor) / factor;
  return rounded.toString();
}

export interface QuantityInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  maxDecimals?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const QuantityInput = memo(function QuantityInput({
  value,
  onChange,
  min = 0.001,
  max = 1_000_000,
  maxDecimals = 3,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: QuantityInputProps) {
  const [text, setText] = useState<string>(() => formatQty(value, maxDecimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatQty(value, maxDecimals));
  }, [value, focused, maxDecimals]);

  const handleChange = (raw: string) => {
    if (disabled) return;
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
    const dot = raw.indexOf('.');
    if (dot >= 0 && raw.length - dot - 1 > maxDecimals) return;
    setText(raw);
    if (raw === '' || raw === '.') return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (n < min || n > max) return;
    onChange(n);
  };

  const handleBlur = () => {
    setFocused(false);
    const n = Number(text);
    const invalid = text === '' || text === '.' || !Number.isFinite(n) || n < min;
    if (invalid) {
      const fallback = value >= min ? value : min;
      setText(formatQty(fallback, maxDecimals));
      if (fallback !== value) onChange(fallback);
    } else {
      const clamped = Math.min(n, max);
      setText(formatQty(clamped, maxDecimals));
      if (clamped !== value) onChange(clamped);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      value={focused ? text : formatQty(value, maxDecimals)}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={(e) => {
        if (disabled) return;
        setFocused(true);
        setText(formatQty(value, maxDecimals));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={handleBlur}
      className={className}
      aria-label={ariaLabel}
    />
  );
});
QuantityInput.displayName = 'QuantityInput';

export default QuantityInput;
