export function LoadingState({ message = 'Carregando…', detail = '', inline = false, className = '' }) {
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
      className={`mx-auto grid w-full place-items-center gap-4 py-16 text-center motion-safe:animate-workly-late-in ${className}`}
    >
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="h-2.5 w-2.5 rounded-full bg-workly-forest motion-safe:animate-workly-dot dark:bg-workly-dark-accent"
          />
        ))}
      </span>
      <p className="text-[0.95rem] font-medium text-workly-muted-warm dark:text-workly-dark-text-muted">
        {message}
      </p>
      {detail && <p className="-mt-2 text-sm text-workly-muted-warm dark:text-workly-dark-text-muted">{detail}</p>}
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
