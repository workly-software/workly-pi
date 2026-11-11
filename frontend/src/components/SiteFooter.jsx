export function FooterSection({ title, children, className = '', headingClassName = '', tone }) {
  return (
    <section className={`min-w-0 ${className}`}>
      <h2
        className={`mb-4 text-base leading-tight font-semibold ${tone === 'paper' ? 'text-workly-ink-warm dark:text-[#ecebe5]' : 'text-workly-ink-warm dark:text-workly-dark-text'} ${headingClassName}`}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function SiteFooter({
  children,
  bottom,
  catalog = false,
  lineHeight,
  flush = false,
  tone
}) {
  const paper = tone === 'paper';
  const ground = paper
    ? 'border-workly-rule bg-workly-paper text-workly-ink-warm dark:border-white/10 dark:bg-workly-night dark:text-[#ecebe5]'
    : `border-workly-border bg-workly-surface dark:border-[rgba(170,180,172,0.18)] dark:bg-[rgba(12,20,17,0.96)] ${catalog ? 'text-workly-ink-warm dark:text-workly-dark-text' : 'text-workly-text-muted dark:text-[#9aa59f]'}`;
  return (
    <footer
      style={{ lineHeight }}
      className={`${flush ? '' : 'mt-16'} w-full border-t px-10 pt-12 pb-7 legacy-max-820:pt-10 legacy-max-720:px-6 ${ground}`}
    >
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-3 gap-10 legacy-max-820:grid-cols-1 legacy-max-820:gap-8">
        {children}
      </div>
      {bottom && (
        <div
          className={`mx-auto mt-10 w-full max-w-[1200px] border-t pt-6 text-center text-sm ${paper ? 'border-workly-rule text-workly-muted-warm dark:border-white/10 dark:text-[#9aa59f]' : 'border-workly-border text-workly-text-muted dark:border-[rgba(170,180,172,0.18)] dark:text-[#9aa59f]'}`}
        >
          {bottom}
        </div>
      )}
    </footer>
  );
}
