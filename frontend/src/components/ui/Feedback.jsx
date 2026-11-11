export function LoadingState({
  message = 'Carregando dados da Workly...',
  detail = 'Preparando as informações para você.',
  inline = false,
  className = ''
}) {
  if (inline)
    return (
      <span role="status" aria-live="polite" className={className}>
        {message}
      </span>
    );
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mx-auto my-5 grid w-full max-w-[460px] place-items-center gap-2.5 rounded-lg border border-[rgba(120,112,96,0.18)] bg-workly-card/78 px-[26px] py-[30px] text-center text-workly-ink-warm shadow-[0_1px_2px_rgba(22,33,27,0.05)] dark:border-[rgba(170,180,172,0.18)] dark:bg-workly-night-raised dark:text-workly-dark-text ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-[42px] w-[42px] animate-workly-spin rounded-full border-4 border-[rgba(4,191,85,0.16)] border-t-workly-primary motion-reduce:animate-none"
      />
      <strong>{message}</strong>
      {detail && <small className="text-workly-muted-warm dark:text-[#9aa59f]">{detail}</small>}
    </div>
  );
}

export function ErrorState({ children, className = '' }) {
  return (
    <div role="alert" className={`min-w-0 ${className}`}>
      {children}
    </div>
  );
}
export function EmptyState({ children, className = '' }) {
  return (
    <div role="status" className={`min-w-0 ${className}`}>
      {children}
    </div>
  );
}

export function StatePanel({ error = false, icon, title, message, action, className = '' }) {
  const Wrapper = error ? ErrorState : EmptyState;
  return (
    <Wrapper
      className={`col-span-full mx-auto grid w-full max-w-[560px] justify-items-center gap-3 rounded-xl border border-dashed border-workly-border bg-workly-surface px-6 py-10 text-center dark:border-workly-dark-border dark:bg-workly-dark-surface ${className}`}
    >
      <span
        aria-hidden="true"
        className={`grid h-12 w-12 place-items-center rounded-full text-lg ${error ? 'bg-[#fff1f2] text-[#be123c] dark:bg-[#be123c]/15 dark:text-[#fda4af]' : 'bg-workly-primary-tint text-workly-primary-ink dark:bg-workly-dark-accent/10 dark:text-workly-dark-accent'}`}
      >
        <i className={`fas ${icon || (error ? 'fa-wifi' : 'fa-briefcase')}`} />
      </span>
      <h3 className="text-xl font-semibold text-workly-text text-balance dark:text-workly-dark-text">
        {title}
      </h3>
      <p className="max-w-[44ch] text-workly-text-muted text-pretty dark:text-workly-dark-text-muted">
        {message}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </Wrapper>
  );
}
