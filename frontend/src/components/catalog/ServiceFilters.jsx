import { useEffect, useRef, useState } from 'react';
import { categories, formatCurrency } from '../../services/catalogService';

const control =
  'h-11 w-full min-w-0 rounded-md border border-workly-rule bg-workly-card px-3 text-[0.95rem] text-workly-ink-warm outline-none transition-[border-color,box-shadow] focus:border-workly-forest focus:shadow-[0_0_0_3px_rgba(14,59,44,0.14)] dark:focus:border-workly-dark-accent';
const label = 'mb-1.5 block text-sm font-medium text-workly-ink-warm';
const ratings = [
  ['', 'Qualquer avaliação'],
  ['4.5', '4,5 ou mais'],
  ['4', '4,0 ou mais'],
  ['3', '3,0 ou mais']
];
const orders = [
  ['recentes', 'Mais recentes'],
  ['preco_asc', 'Menor preço'],
  ['preco_desc', 'Maior preço'],
  ['avaliacao', 'Melhor avaliação']
];
const empty = { q: '', categoria: '', min: '', max: '', avaliacaoMin: '', ordenar: 'recentes' };

function useDismiss(open, setOpen, refs) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    const onDown = (event) => {
      if (!refs.some((ref) => ref.current?.contains(event.target))) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, setOpen, refs]);
}

function PriceFields({ filters, onChange, prefix = 'filter' }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor={`${prefix}Min`} className={label}>
          Mínimo (R$)
        </label>
        <input
          id={`${prefix}Min`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="0,00"
          value={filters.min}
          onChange={(event) => onChange({ ...filters, min: event.target.value })}
          className={control}
        />
      </div>
      <div>
        <label htmlFor={`${prefix}Max`} className={label}>
          Máximo (R$)
        </label>
        <input
          id={`${prefix}Max`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Sem limite"
          value={filters.max}
          onChange={(event) => onChange({ ...filters, max: event.target.value })}
          className={control}
        />
      </div>
    </div>
  );
}

export default function ServiceFilters({ filters, onChange, onSubmit, onApply, count }) {
  const [priceOpen, setPriceOpen] = useState(false),
    [sheetOpen, setSheetOpen] = useState(false);
  const priceButton = useRef(null),
    pricePanel = useRef(null),
    sheet = useRef(null);
  useDismiss(priceOpen, setPriceOpen, [priceButton, pricePanel]);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event) => event.key === 'Escape' && setSheetOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    sheet.current?.querySelector('select, input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);
  const category = categories.find((item) => item.id === filters.categoria);
  const price =
    filters.min && filters.max
      ? `${formatCurrency(filters.min)} a ${formatCurrency(filters.max)}`
      : filters.min
        ? `A partir de ${formatCurrency(filters.min)}`
        : filters.max
          ? `Até ${formatCurrency(filters.max)}`
          : '';
  const chips = [
    filters.q && ['q', `“${filters.q}”`, { q: '' }],
    category && ['categoria', category.label, { categoria: '' }],
    price && ['preco', price, { min: '', max: '' }],
    filters.avaliacaoMin && ['avaliacao', ratings.find(([v]) => v === filters.avaliacaoMin)?.[1], { avaliacaoMin: '' }]
  ].filter(Boolean);
  const apply = (next) => {
    setPriceOpen(false);
    setSheetOpen(false);
    onApply(next);
  };
  const submit = (event) => {
    setPriceOpen(false);
    setSheetOpen(false);
    onSubmit(event);
  };
  const select = (key, options, id, aria) => (
    <select
      id={id}
      aria-label={aria}
      value={filters[key]}
      onChange={(event) => onChange({ ...filters, [key]: event.target.value })}
      className={`${control} pr-8`}
    >
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
  const categoryOptions = [['', 'Todas as categorias'], ...categories.map((item) => [item.id, item.label])];
  return (
    <form onSubmit={submit} id="servicesFilterForm" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-[1_1_240px]">
          <span className="sr-only">Buscar serviço</span>
          <i aria-hidden="true" className="fas fa-search pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-workly-muted-warm" />
          <input
            id="filterSearch"
            type="search"
            enterKeyHint="search"
            placeholder="Buscar serviço"
            value={filters.q}
            onChange={(event) => onChange({ ...filters, q: event.target.value })}
            className={`${control} pl-10`}
          />
        </label>
        <div className="hidden w-[190px] lg:block">{select('categoria', categoryOptions, 'filterCategory', 'Categoria')}</div>
        <div className="relative hidden lg:block">
          <button
            ref={priceButton}
            type="button"
            aria-expanded={priceOpen}
            aria-controls="price-panel"
            onClick={() => setPriceOpen(!priceOpen)}
            className={`inline-flex h-11 items-center gap-2 rounded-md border px-3.5 text-[0.95rem] whitespace-nowrap transition-colors ${price ? 'border-workly-forest/40 bg-workly-primary-tint text-workly-ink-warm' : 'border-workly-rule bg-workly-card text-workly-ink-warm hover:border-workly-forest/40'}`}
          >
            Preço
            <i aria-hidden="true" className={`fas fa-chevron-down text-xs transition-transform ${priceOpen ? 'rotate-180' : ''}`} />
          </button>
          <div
            ref={pricePanel}
            id="price-panel"
            hidden={!priceOpen}
            className="absolute top-[calc(100%+8px)] left-0 z-30 w-[320px] rounded-lg border border-workly-rule bg-workly-card p-4 shadow-[0_12px_32px_rgba(22,33,27,0.12)]"
          >
            <PriceFields filters={filters} onChange={onChange} />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => apply({ ...filters, min: '', max: '' })}
                className="h-10 rounded-md px-3 text-sm font-semibold text-workly-muted-warm hover:text-workly-ink-warm"
              >
                Limpar preço
              </button>
              <button type="submit" className="h-10 rounded-md bg-workly-forest px-4 text-sm font-semibold text-workly-on-forest hover:bg-workly-forest-raised dark:bg-workly-dark-accent dark:text-workly-night">
                Aplicar
              </button>
            </div>
          </div>
        </div>
        <div className="hidden w-[170px] lg:block">{select('avaliacaoMin', ratings, 'filterRating', 'Avaliação mínima')}</div>
        <div className="hidden w-[166px] lg:block">{select('ordenar', orders, 'filterSort', 'Ordenação')}</div>
        <button
          type="submit"
          className="hidden h-11 items-center gap-2 rounded-md bg-workly-forest px-5 font-semibold text-workly-on-forest transition-[background-color,transform] hover:bg-workly-forest-raised motion-safe:active:scale-[0.97] lg:inline-flex dark:bg-workly-dark-accent dark:text-workly-night"
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-workly-rule bg-workly-card px-4 font-semibold text-workly-ink-warm lg:hidden"
        >
          <i aria-hidden="true" className="fas fa-sliders" />
          Filtros{chips.length ? ` (${chips.length})` : ''}
        </button>
      </div>
      {(chips.length > 0 || count !== undefined) && (
        <div className="flex flex-wrap items-center gap-2">
          {count !== undefined && (
            <span className="mr-2 text-sm text-workly-muted-warm tabular-nums" aria-live="polite">
              {count} {count === 1 ? 'resultado' : 'resultados'}
            </span>
          )}
          {chips.map(([key, text, reset]) => (
            <button
              key={key}
              type="button"
              onClick={() => apply({ ...filters, ...reset })}
              aria-label={`Remover filtro ${text}`}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-workly-rule bg-workly-card pr-2.5 pl-3 text-sm text-workly-ink-warm transition-colors hover:border-workly-forest/40"
            >
              {text}
              <i aria-hidden="true" className="fas fa-xmark text-xs text-workly-muted-warm" />
            </button>
          ))}
          {chips.length > 0 && (
            <button
              type="button"
              onClick={() => apply({ ...empty, ordenar: filters.ordenar })}
              className="h-8 px-2 text-sm font-semibold text-workly-primary-ink underline-offset-4 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}
      {sheetOpen && (
        <div className="fixed inset-0 z-[1200] lg:hidden" role="dialog" aria-modal="true" aria-labelledby="filters-title">
          <button type="button" aria-label="Fechar filtros" onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-[rgba(12,20,17,0.45)]" />
          <div ref={sheet} className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-xl bg-workly-card p-5 pb-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="filters-title" className="text-lg font-semibold text-workly-ink-warm">
                Filtros
              </h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Fechar filtros"
                className="grid h-10 w-10 place-items-center rounded-full text-workly-muted-warm hover:bg-workly-sunken"
              >
                <i aria-hidden="true" className="fas fa-xmark" />
              </button>
            </div>
            <div className="grid gap-5">
              <div>
                <label htmlFor="sheetCategory" className={label}>
                  Categoria
                </label>
                {select('categoria', categoryOptions, 'sheetCategory', 'Categoria')}
              </div>
              <fieldset>
                <legend className="sr-only">Preço</legend>
                <PriceFields filters={filters} onChange={onChange} prefix="sheet" />
              </fieldset>
              <div>
                <label htmlFor="sheetRating" className={label}>
                  Avaliação
                </label>
                {select('avaliacaoMin', ratings, 'sheetRating', 'Avaliação mínima')}
              </div>
              <div>
                <label htmlFor="sheetSort" className={label}>
                  Ordenar por
                </label>
                {select('ordenar', orders, 'sheetSort', 'Ordenação')}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
              <button
                type="button"
                onClick={() => apply({ ...empty })}
                className="h-12 rounded-md border border-workly-rule px-4 font-semibold text-workly-ink-warm"
              >
                Limpar
              </button>
              <button type="submit" className="h-12 rounded-md bg-workly-forest font-semibold text-workly-on-forest dark:bg-workly-dark-accent dark:text-workly-night">
                Ver resultados
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
