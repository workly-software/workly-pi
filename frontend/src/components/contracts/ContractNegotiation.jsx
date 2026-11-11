import { useId, useState } from 'react';
import { ModuleButton, moduleInput } from '../ui/ModuleUI';
import { formatCurrency } from '../../services/catalogService';
import { historyEntry, negotiationOpen } from '../../services/contractService';

const panel =
  'mt-3 grid max-w-[560px] gap-3 rounded-md border border-workly-rule bg-workly-paper p-3.5 dark:border-white/10 dark:bg-workly-night';
const note = 'flex items-start gap-2 text-[0.95rem] text-workly-ink-warm';

export function NegotiationPanel({ contract: c, onAction }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  if (!negotiationOpen(c)) return null;
  const { vez, valorEmNegociacao: onTable, estado } = c.negociacao;
  const other = c.papel === 'cliente' ? 'o freelancer' : 'o cliente';
  const myTurn = vez === c.papel || vez === 'ambos';
  const canApprove = vez === c.papel && onTable;
  async function run(action, body) {
    setBusy(true);
    const ok = await onAction(c.idContrato, action, body);
    setBusy(false);
    if (ok) setValue('');
  }
  const message =
    estado === 'pendente_acordo'
      ? 'Este contrato ainda não tem valor aprovado pelas duas partes. Proponha um valor para continuar.'
      : canApprove
        ? `${c.papel === 'cliente' ? 'O freelancer propôs' : 'O cliente propôs'} ${formatCurrency(onTable)}. Aprove para fechar o acordo ou envie outro valor.`
        : vez === c.papel
          ? `Ainda não há valor proposto. Envie um valor para ${other} aprovar.`
          : onTable
            ? `Aguardando ${other} responder ao valor de ${formatCurrency(onTable)}.`
            : `Aguardando ${other} propor um valor.`;
  return (
    <section aria-label="Negociação do valor" className={panel} data-negotiation={c.idContrato}>
      <p className={note}>
        <i aria-hidden="true" className="fas fa-handshake mt-1 text-sm text-workly-primary-ink" />
        <span>{message}</span>
      </p>
      {myTurn && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (value) run('propor-valor', { valor: Number(value) });
          }}
        >
          {canApprove && (
            <ModuleButton
              type="button"
              disabled={busy}
              className="min-h-10 px-4 text-sm"
              onClick={() => run('aprovar-valor', { valor: onTable })}
            >
              <i aria-hidden="true" className="fas fa-check" />
              Aprovar {formatCurrency(onTable)}
            </ModuleButton>
          )}
          <label htmlFor={inputId} className="sr-only">
            {canApprove ? 'Outro valor em reais' : 'Valor em reais'}
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            placeholder={canApprove ? 'Outro valor (R$)' : 'Valor (R$)'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={`${moduleInput} max-w-[180px] py-2 tabular-nums`}
          />
          <ModuleButton type="submit" tone="secondary" disabled={busy || !value} className="min-h-10 px-4 text-sm">
            <i aria-hidden="true" className="fas fa-paper-plane" />
            {onTable ? 'Enviar contraproposta' : 'Propor valor'}
          </ModuleButton>
        </form>
      )}
    </section>
  );
}

export function AdjustmentRequest({ contract: c, onAction }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  if (c.papel !== 'cliente' || c.status !== 'entregue') return null;
  if (!open)
    return (
      <ModuleButton tone="secondary" className="mt-3 min-h-10 px-4 text-sm" onClick={() => setOpen(true)}>
        <i aria-hidden="true" className="fas fa-rotate-left" />
        Solicitar ajuste
      </ModuleButton>
    );
  return (
    <form
      className={panel}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const ok = await onAction(c.idContrato, 'solicitar-ajuste', { justificativa: reason.trim() });
        setBusy(false);
        if (ok) {
          setReason('');
          setOpen(false);
        }
      }}
    >
      <label htmlFor={fieldId} className="text-[0.95rem] font-medium text-workly-ink-warm">
        O que precisa ser ajustado?
      </label>
      <textarea
        id={fieldId}
        required
        minLength={10}
        maxLength={1000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Explique o que falta ou o que deve mudar na entrega."
        className={`${moduleInput} min-h-[88px]`}
      />
      <p className="text-xs text-workly-muted-warm">
        O contrato volta para “Em andamento” e o freelancer pode enviar uma nova entrega.
      </p>
      <div className="flex flex-wrap gap-2">
        <ModuleButton type="submit" disabled={busy || reason.trim().length < 10} className="min-h-10 px-4 text-sm">
          <i aria-hidden="true" className="fas fa-paper-plane" />
          Enviar pedido de ajuste
        </ModuleButton>
        <ModuleButton type="button" tone="secondary" className="min-h-10 px-4 text-sm" onClick={() => setOpen(false)}>
          Voltar
        </ModuleButton>
      </div>
    </form>
  );
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function ContractHistory({ contract: c }) {
  const events = c.historico || [];
  if (!events.length) return null;
  return (
    <details className="mt-3 max-w-[560px] text-sm text-workly-muted-warm">
      <summary className="inline-flex min-h-10 cursor-pointer items-center gap-2 font-medium text-workly-ink-warm">
        <i aria-hidden="true" className="fas fa-clock-rotate-left text-xs" />
        Histórico do contrato ({events.length})
      </summary>
      <ol className="mt-1 grid gap-2 border-l border-workly-rule pl-3.5 dark:border-white/10">
        {events.map((event, index) => (
          <li key={index}>
            <span className="text-workly-ink-warm">{historyEntry(event, c.papel)}</span>
            {event.data && <span className="ml-2 tabular-nums">{dateFormat.format(new Date(event.data))}</span>}
            {event.justificativa && (
              <p className="mt-0.5 text-workly-ink-warm/85">“{event.justificativa}”</p>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
