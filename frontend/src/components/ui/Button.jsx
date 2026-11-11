import { Link } from 'react-router';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-workly-out motion-safe:active:scale-[0.97]';
const variants = {
  primary:
    'bg-workly-forest text-workly-on-forest hover:bg-workly-forest-raised dark:bg-workly-dark-accent dark:text-workly-night dark:hover:bg-[#6ee7a0]',
  secondary:
    'border border-workly-rule bg-workly-card text-workly-ink-warm hover:border-workly-forest/40 hover:text-workly-forest dark:border-workly-dark-border dark:bg-workly-dark-surface dark:text-workly-dark-text dark:hover:text-workly-dark-accent',
  ghost:
    'text-workly-primary-ink hover:bg-workly-primary-tint dark:text-workly-dark-accent dark:hover:bg-workly-dark-accent/10',
  danger: 'bg-[#fff1f2] text-[#be123c] hover:bg-[#ffe4e6]',
  forest:
    'bg-workly-forest text-workly-on-forest hover:bg-workly-forest-raised dark:bg-workly-dark-accent dark:text-workly-night dark:hover:bg-[#6ee7a0]'
};
const sizes = {
  md: 'min-h-11 px-5 text-base',
  lg: 'min-h-12 px-6 text-[1.0625rem]'
};

export const buttonStyles = (variant = 'primary', size = 'md', shape = 'rounded-lg') =>
  `${base} ${shape} ${variants[variant]} ${sizes[size]}`;

export default function Button({
  to,
  className = '',
  appearance = 'default',
  variant = 'primary',
  size = 'md',
  shape,
  disabled = false,
  type = 'button',
  children,
  ...props
}) {
  const styles = appearance === 'custom' ? '' : buttonStyles(variant, size, shape);
  if (to !== undefined)
    return (
      <Link {...props} to={to} className={`${styles} ${className}`}>
        {children}
      </Link>
    );
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={`${styles} disabled:cursor-not-allowed ${appearance === 'default' ? 'disabled:opacity-60 disabled:active:scale-100' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
