import { Link } from 'react-router';
import Button from '../ui/Button';
import { ModuleButton } from '../ui/ModuleUI';
import { serviceImage } from '../home/offices';
import {
  canReview,
  contractActions,
  contractFeedback,
  contractPrice,
  contractStatus,
  finalStatuses
} from '../../services/contractService';
import { defaultServiceImage } from '../../services/catalogService';
import ReviewForm from './ReviewForm';
import { AdjustmentRequest, ContractHistory, NegotiationPanel } from './ContractNegotiation';

const tone = {
  waiting: 'bg-[#fdf3e2] text-[#8a5000] dark:bg-[#f2c14e]/15 dark:text-[#f2c14e]',
  cancelled: 'bg-[#fde8e8] text-[#9b1c1c] dark:bg-[#fda4af]/15 dark:text-[#fda4af]',
  active: 'bg-workly-primary-tint text-workly-primary-ink',
  done: 'bg-workly-sunken text-workly-ink-warm'
};
const meta = 'inline-flex items-center gap-1.5 text-sm text-workly-muted-warm';
const steps = ['Pedido', 'Em andamento', 'Entregue', 'Concluído'];
const stage = {
  pendente: 0,
  proposta_pendente: 0,
  proposta_aceita: 0,
  em_andamento: 1,
  entregue: 2,
  concluido: 3,
  encerrado: 3
};
function Steps({ status }) {
  const current = stage[status];
  if (current === undefined) return null;
  return (
    <ol aria-label="Etapas do contrato" className="mt-4 grid max-w-[560px] grid-cols-4 gap-1.5">
      {steps.map((label, index) => (
        <li key={label} aria-current={index === current ? 'step' : undefined} className="min-w-0">
          <span
            className={`block h-[3px] rounded-full ${index <= current ? 'bg-workly-primary dark:bg-workly-dark-accent' : 'bg-workly-rule dark:bg-white/10'}`}
          />
          <span
            className={`mt-1.5 block truncate text-xs ${index === current ? 'font-semibold text-workly-ink-warm' : 'text-workly-muted-warm'}`}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ContractCard({ contract: c, onAction, onReview }) {
  const other = c.papel === 'cliente' ? c.freelancer : c.cliente,
    [priceIcon, price] = contractPrice(c),
    feedback = contractFeedback(c),
    actions = contractActions(c),
    danger = actions.filter(([action]) => ['cancelar', 'recusar'].includes(action)),
    primary = actions.filter(([action]) => !['cancelar', 'recusar'].includes(action));
  const status = ['pendente', 'proposta_pendente'].includes(c.status)
    ? tone.waiting
    : c.status === 'cancelado'
      ? tone.cancelled
      : c.status === 'em_andamento'
        ? tone.active
        : tone.done;
  return (
    <article
      data-contract-id={c.idContrato}
      className="grid gap-x-5 gap-y-4 p-4 transition-colors duration-700 data-[highlight]:bg-workly-primary-tint/45 first:rounded-t-xl last:rounded-b-xl sm:grid-cols-[88px_minmax(0,1fr)] sm:p-6 lg:grid-cols-[88px_minmax(0,1fr)_minmax(180px,auto)] lg:gap-x-8"
    >
      <img
        src={serviceImage(c, defaultServiceImage)}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = defaultServiceImage;
        }}
        alt=""
        loading="lazy"
        className="hidden aspect-square w-[88px] rounded-lg bg-workly-sunken object-cover sm:block"
      />
      <div className="min-w-0">
        <div className="min-w-0">
          <h3 className="text-[1.0625rem] leading-snug font-semibold text-workly-ink-warm">
            {c.nomeServico}
          </h3>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className={meta}>
              <i aria-hidden="true" className="far fa-user" />
              {c.papel === 'cliente' ? 'Freelancer: ' : 'Cliente: '}
              {other?.nome || 'Usuário'}
            </span>
            <span className={meta}>
              <i aria-hidden="true" className={`fas ${priceIcon}`} />
              <span className="font-medium text-workly-ink-warm tabular-nums">{price}</span>
            </span>
            {c.tipoContratacao && c.tipoContratacao !== 'fixo' && (
              <span className={meta}>
                <i aria-hidden="true" className="fas fa-handshake" />
                {c.tipoContratacao === 'combinar' ? 'Valor a combinar' : 'Negociação'}
              </span>
            )}
          </p>
        </div>
        <span className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-[0.8rem] font-semibold lg:hidden ${status}`}>
          {contractStatus(c.status)}
        </span>
        <Steps status={c.status} />
        {c.descricaoServico && (
          <p className="mt-3 line-clamp-1 max-w-[72ch] text-[0.925rem] leading-relaxed text-workly-muted-warm">
            {c.descricaoServico}
          </p>
        )}
        {c.mensagem && (
          <blockquote className="mt-3 max-w-[72ch] border-l-2 border-workly-primary/60 pl-3.5 text-[0.925rem] leading-relaxed text-workly-ink-warm/85">
            <span className="sr-only">Mensagem: </span>
            “{c.mensagem}”
          </blockquote>
        )}
        {!canReview(c) && feedback && (
          <p
            className={`mt-3 flex items-start gap-2 rounded-md px-3.5 py-2.5 text-[0.95rem] font-medium ${feedback[2] ? tone.active : tone.waiting}`}
          >
            <i aria-hidden="true" className={`fas ${feedback[0]} mt-1 text-sm`} />
            {feedback[1]}
          </p>
        )}
        <NegotiationPanel contract={c} onAction={onAction} />
        <AdjustmentRequest contract={c} onAction={onAction} />
        {canReview(c) && (
          <div className="mt-4">
            <ReviewForm contract={c} onReview={onReview} />
          </div>
        )}
        <ContractHistory contract={c} />
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden sm:col-start-2 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:flex-col lg:items-end lg:gap-3">
        <span className={`hidden shrink-0 items-center rounded-full lg:inline-flex px-3 py-1 text-[0.8rem] font-semibold ${status}`}>
          {contractStatus(c.status)}
        </span>
        {primary.map(([action, label]) => (
          <ModuleButton
            key={action}
            data-action={action}
            className="min-h-10 px-4 text-sm"
            onClick={() => onAction(c.idContrato, action)}
          >
            <i
              aria-hidden="true"
              className={`fas ${action === 'iniciar' || c.status === 'pendente' ? 'fa-play' : 'fa-check'}`}
            />
            {label}
          </ModuleButton>
        ))}
      </div>
      <div className="-mt-2 -ml-2.5 flex flex-wrap items-center gap-1 sm:col-start-2 lg:row-start-2">
        <Link
          to={finalStatuses.includes(c.status) ? `/contrato-chat?id=${c.idContrato}` : `/mensagens?contrato=${c.idContrato}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors text-workly-primary-ink hover:bg-workly-primary-tint"
        >
          <i aria-hidden="true" className="fas fa-comments" />
          {finalStatuses.includes(c.status) ? 'Ver conversa' : 'Chat'}
        </Link>
        {c.idServico && c.servicoDisponivel !== false && (
          <Link to={`/detalhe-servico?id=${c.idServico}`} className="inline-flex min-h-10 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors text-workly-ink-warm hover:bg-workly-sunken">
            Ver serviço
          </Link>
        )}
        {danger.map(([action, label]) => (
          <Button
            key={action}
            appearance="custom"
            data-action={action}
            className="inline-flex min-h-10 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors text-[#9b1c1c] hover:bg-[#fde8e8] dark:text-[#fda4af] dark:hover:bg-[#fda4af]/10"
            onClick={() => onAction(c.idContrato, action)}
          >
            <i aria-hidden="true" className="fas fa-xmark" />
            {label}
          </Button>
        ))}
      </div>
    </article>
  );
}