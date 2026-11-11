import { useState } from 'react';
import { ModuleButton } from '../ui/ModuleUI';
import ContractCard from './ContractCard';

export default function ContractSection({ items, received, ...props }) {
  const [open, setOpen] = useState(true),
    title = received ? 'Me contrataram' : 'Contratei',
    panelId = received ? 'contratos-recebidos' : 'contratos-contratados';
  return (
    <section className="grid gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-3 font-workly-display text-[1.5rem] leading-tight font-semibold tracking-[-0.015em] text-workly-ink-warm [font-variation-settings:'opsz'_48]">
            {title}
            <span className="inline-grid h-7 min-w-7 place-items-center rounded-full bg-workly-sunken px-2 font-workly text-sm font-semibold text-workly-ink-warm tabular-nums">
              {items.length}
            </span>
          </h2>
          <p className="mt-1 text-[0.95rem] text-workly-muted-warm">
            {received
              ? 'Propostas e trabalhos recebidos dos seus clientes.'
              : 'Serviços comprados por você. Acompanhe propostas, entregas e avaliações.'}
          </p>
        </div>
        <button
          type="button"
          data-contract-toggle={received ? 'recebidos' : 'contratados'}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-workly-muted-warm transition-colors hover:bg-workly-sunken hover:text-workly-ink-warm"
        >
          {open ? 'Recolher' : 'Mostrar'}
          <i
            aria-hidden="true"
            className={`fas fa-chevron-down text-xs transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </button>
      </div>
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        inert={!open ? true : undefined}
      >
        <div className="min-h-0 overflow-hidden">
          {items.length ? (
            <div className="divide-y divide-workly-rule rounded-xl border border-workly-rule bg-workly-card dark:divide-white/10 dark:border-white/10">
              {items.map((c) => (
                <ContractCard key={c.idContrato} contract={c} {...props} />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-workly-rule px-6 py-5 text-workly-muted-warm dark:border-white/15">
              <p>
                {received
                  ? 'Você ainda não recebeu propostas ou contratações.'
                  : 'Você ainda não contratou nenhum serviço.'}
              </p>
              <ModuleButton
                to={received ? '/anuncio' : '/todos-servicos'}
                tone={received ? 'secondary' : 'primary'}
              >
                {received ? 'Publicar serviço' : 'Explorar serviços'}
              </ModuleButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
