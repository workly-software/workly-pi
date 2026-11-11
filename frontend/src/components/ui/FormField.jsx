import { useId } from 'react';

export default function FormField({
  id,
  label,
  error,
  className = '',
  appearance = 'default',
  wrapperClassName,
  labelClassName,
  errorClassName,
  controlChildren,
  children,
  as: Control = 'input',
  ...props
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const content = controlChildren ?? (Control === 'input' ? undefined : children);
  const description =
    [props['aria-describedby'], error ? `${controlId}-error` : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className={wrapperClassName || 'mb-5 min-w-0'}>
      <label htmlFor={controlId} className={labelClassName || 'mb-2 block text-sm font-medium'}>
        {label}
      </label>
      <Control
        {...props}
        id={controlId}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description}
        className={`${appearance === 'custom' ? '' : 'w-full min-w-0 rounded-md border border-workly-rule bg-workly-card px-[15px] py-3 text-[0.95rem] text-workly-ink-warm outline-none transition-[border-color,box-shadow] placeholder:text-workly-muted-warm focus:border-workly-forest focus:shadow-[0_0_0_3px_rgba(14,59,44,0.14)] aria-[invalid=true]:border-[#be123c] dark:border-white/15 dark:bg-workly-night dark:text-[#ecebe5] dark:focus:border-workly-dark-accent'} ${className}`}
      >
        {content}
      </Control>
      {(Control === 'input' || controlChildren !== undefined) && children}
      {error && (
        <p id={`${controlId}-error`} role="alert" className={errorClassName || 'mt-2 text-sm'}>
          {error}
        </p>
      )}
    </div>
  );
}
