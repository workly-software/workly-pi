import { useState } from 'react';
import Button from '../ui/Button';
import { paginationItems } from '../../services/serviceSearchService';

const cell =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-md px-2 font-semibold tabular-nums transition-[background-color,color,transform] duration-150 ease-workly-out motion-safe:active:scale-[0.97]';
const idle =
  'text-workly-ink-warm hover:bg-workly-sunken dark:text-workly-dark-text dark:hover:bg-white/10';
const current = 'bg-workly-forest text-workly-on-forest dark:bg-workly-dark-accent dark:text-workly-night';

function PageJump({ totalPages, onPage, onClose }) {
  function submit(event) {
    event.preventDefault();
    const value = Number(new FormData(event.currentTarget).get('pagina'));
    onClose();
    if (Number.isFinite(value) && value >= 1) onPage(Math.min(Math.trunc(value), totalPages));
  }
  return (
    <form onSubmit={submit} noValidate className="inline-flex">
      <input
        name="pagina"
        type="number"
        inputMode="numeric"
        min="1"
        max={totalPages}
        autoFocus
        aria-label={`Ir para a página (1 a ${totalPages})`}
        onBlur={onClose}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        className="h-10 w-10 rounded-md border border-workly-forest bg-workly-card px-0.5 text-center font-semibold text-workly-ink-warm tabular-nums outline-none [appearance:textfield] focus:shadow-[0_0_0_3px_rgba(14,59,44,0.14)] dark:border-workly-dark-accent dark:bg-workly-dark-surface dark:text-workly-dark-text [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </form>
  );
}

export default function Pagination({ pagination, onPage }) {
  const [jumping, setJumping] = useState(null);
  if (!pagination || (pagination.totalPages <= 1 && pagination.page <= 1)) return null;
  const { page, totalPages } = pagination;
  const missing = page > totalPages;
  function go(next) {
    onPage(next);
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  return (
    <nav aria-label="Páginas de serviços" className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-4">
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => go(Math.min(page - 1, totalPages))}
      >
        <i aria-hidden="true" className="fas fa-chevron-left text-sm" />
        Anterior
      </Button>
      {missing ? (
        <span role="status" className="order-first w-full text-center text-sm text-workly-muted-warm sm:order-none sm:w-auto">
          Esta página não está mais disponível
        </span>
      ) : (
        <ol className="order-first flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto">
          {paginationItems(page, totalPages).map((item) => (
            <li key={item}>
              {typeof item === 'number' ? (
                <button
                  type="button"
                  onClick={() => item !== page && go(item)}
                  aria-current={item === page ? 'page' : undefined}
                  aria-label={`Página ${item}${item === totalPages ? ' (última)' : ''}`}
                  className={`${cell} ${item === page ? current : idle}`}
                >
                  {item}
                </button>
              ) : jumping === item ? (
                <PageJump totalPages={totalPages} onPage={go} onClose={() => setJumping(null)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setJumping(item)}
                  aria-label="Digitar o número da página"
                  title="Ir para a página…"
                  className={`${cell} ${idle} text-workly-muted-warm`}
                >
                  …
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <Button
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
      >
        Próxima
        <i aria-hidden="true" className="fas fa-chevron-right text-sm" />
      </Button>
    </nav>
  );
}
