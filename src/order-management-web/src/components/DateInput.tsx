import type { InputHTMLAttributes } from 'react';
import { finalizeDateInput, normalizeDateInputValue } from '../lib/dateInput';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function DateInput({ value, onChange, onBlur, min, max, ...rest }: Props) {
  return (
    <input
      type="date"
      value={value}
      min={min ?? '1000-01-01'}
      max={max ?? '9999-12-31'}
      onChange={(e) => onChange(normalizeDateInputValue(e.target.value))}
      onBlur={(e) => {
        onChange(finalizeDateInput(e.target.value));
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}
