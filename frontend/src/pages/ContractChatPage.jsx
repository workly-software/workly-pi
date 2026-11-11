import { useEffect, useRef, useState } from 'react';
import { serviceImage } from '../components/home/offices';
import { useSearchParams } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import { LoadingState } from '../components/ui/Feedback';
import { ModuleButton, ModuleEmpty, ModulePage, moduleSurface } from '../components/ui/ModuleUI';
import MessageHistory from '../components/messages/MessageHistory';
import MessageCompose from '../components/messages/MessageCompose';
import {
  myContracts,
  contractPrice,
  contractStatus,
  finalStatuses
} from '../services/contractService';
import {
  contractId,
  otherUser,
  contractMessages,
  sendContractMessage
} from '../services/messageService';
import { defaultServiceImage } from '../services/catalogService';

import { createRequestScope } from '../services/requestScope';

const pill =
  'inline-flex items-center gap-1.5 rounded-full bg-workly-sunken px-2.5 py-[7px] text-[0.82rem] font-bold text-workly-ink-warm/80 dark:bg-[#1a2621] dark:text-[#ddd8cc]';
export default function ContractChatPage() {
  const [params] = useSearchParams(),
    id = params.get('id'),
    [contract, setContract] = useState(null),
    [error, setError] = useState(null),
    [messages, setMessages] = useState(null),
    [messageError, setMessageError] = useState(''),
    [sendError, setSendError] = useState(''),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [closedByServer, setClosedByServer] = useState(false);
  const readOnly = Boolean(contract) && (closedByServer || finalStatuses.includes(contract.status));
  const scope = useRef(createRequestScope());
  const sendScope = useRef(createRequestScope());
  const currentId = useRef(id);
  currentId.current = id;
  async function loadMessages(signal) {
    const requestId = id,
      isCurrent = scope.current.begin();
    try {
      const result = await contractMessages(requestId, { signal });
      if (!isCurrent() || currentId.current !== requestId) return;
      setMessages(result);
      setMessageError('');
      window.dispatchEvent(new Event('workly:notifications'));
    } catch (error) {
      if (isCurrent() && currentId.current === requestId && error.name !== 'AbortError')
        setMessageError(error.message);
    }
  }
  useEffect(() => {
    let active = true,
      timer;
    const controller = new AbortController();
    scope.current.invalidate();
    sendScope.current.invalidate();
    setContract(null);
    setMessages(null);
    setError(null);
    setMessageError('');
    setSendError('');
    setText('');
    setBusy(false);
    setClosedByServer(false);
    (async () => {
      if (!id) {
        setError([
          'Contrato não informado',
          'Volte para a página de contratos e abra o chat novamente.'
        ]);
        return;
      }
      try {
        const all = await myContracts(),
          c = all.find((c) => contractId(c) === id);
        if (!active) return;
        if (!c) {
          setError([
            'Contrato não encontrado',
            'Você não faz parte deste contrato ou ele não existe mais.'
          ]);
          return;
        }
        setContract(c);
        await loadMessages(controller.signal);
        if (active && !finalStatuses.includes(c.status))
          timer = setInterval(() => loadMessages(controller.signal), 30000);
      } catch (error) {
        if (active) setError(['Erro ao carregar', error.message]);
      }
    })();
    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
      scope.current.invalidate();
      sendScope.current.invalidate();
    };
  }, [id]);
  async function send(value) {
    if (!contract || busy || readOnly) return;
    const requestId = id,
      isCurrent = sendScope.current.begin();
    setBusy(true);
    setSendError('');
    try {
      await sendContractMessage(requestId, value);
      if (!isCurrent() || currentId.current !== requestId) return;
      setText('');
      await loadMessages();
    } catch (error) {
      if (!isCurrent() || currentId.current !== requestId) return;
      setSendError(error.message || 'Não foi possível enviar a mensagem.');
      if (error.status === 409) setClosedByServer(true);
    } finally {
      if (isCurrent() && currentId.current === requestId) setBusy(false);
    }
  }
  return (
    <CatalogShell title="Chat do Contrato" footer="empty">
      <ModulePage
        heroClassName="legacy-max-800:[&_h1]:text-[2rem]"
        kicker={
          <>
            <i aria-hidden="true" className="fas fa-comments" />
            Conversa do contrato
          </>
        }
        title="Chat do contrato"
        description="Combine detalhes, envie atualizações e mantenha o histórico do serviço em um só lugar."
        heroRight={
          <ModuleButton className="py-0!" to="/contratos" tone="secondary">
            <i aria-hidden="true" className="fas fa-arrow-left" />
            Voltar para contratos
          </ModuleButton>
        }
      >
        <section className={`grid items-start gap-6 ${error ? 'max-w-[560px]' : 'grid-cols-[320px_minmax(0,1fr)] legacy-max-920:grid-cols-1'}`}>
          <aside id="chatContractSummary" className="min-w-0">
            {error ? (
              <ModuleEmpty error icon="fa-triangle-exclamation" title={error[0]} message={error[1]}>
                <ModuleButton className="py-0!" to="/contratos">
                  Voltar
                </ModuleButton>
              </ModuleEmpty>
            ) : !contract ? (
              <LoadingState
                message="Carregando contrato..."
                detail="Buscando informações do serviço."
              />
            ) : (
              <article className="sticky top-6 overflow-hidden rounded-lg border border-workly-rule bg-workly-card legacy-max-920:static">
                <img
                  src={serviceImage(contract, defaultServiceImage)}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = defaultServiceImage;
                  }}
                  className="aspect-[16/9] w-full bg-workly-sunken object-cover legacy-max-920:hidden"
                />
                <div className="p-5">
                  <h3 className="text-[1.05rem] leading-snug font-semibold text-workly-ink-warm">
                    {contract.nomeServico || 'Serviço'}
                  </h3>
                  <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-workly-muted-warm">
                    {String(
                      contract.descricaoServico || 'Contrato criado pela plataforma Workly.'
                    ).slice(0, 150)}
                  </p>
                  <dl className="mt-4 grid gap-2.5 border-t border-workly-rule pt-4 text-sm">
                    {[
                      ['Status', contractStatus(contract.status)],
                      ['Com', otherUser(contract).nome || 'Usuário'],
                      [
                        'Contratação',
                        contract.tipoContratacao === 'fixo'
                          ? 'Preço fixo'
                          : contract.tipoContratacao === 'combinar'
                            ? 'Valor a combinar'
                            : 'Negociação'
                      ],
                      ['Valor', contractPrice(contract)[1]]
                    ].map(([label, text]) => (
                      <div key={label} className="flex items-baseline justify-between gap-3">
                        <dt className="text-workly-muted-warm">{label}</dt>
                        <dd className="min-w-0 truncate text-right font-medium text-workly-ink-warm">{text}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 grid gap-2.5">
                    {contract.idServico && contract.servicoDisponivel !== false && (
                      <ModuleButton
                        className="py-0!"
                        to={`/detalhe-servico?id=${contract.idServico}`}
                        tone="secondary"
                      >
                        <i aria-hidden="true" className="fas fa-eye" />
                        Ver serviço
                      </ModuleButton>
                    )}
                    <ModuleButton className="py-0!" to="/contratos" tone="secondary">
                      <i aria-hidden="true" className="fas fa-briefcase" />
                      Ver contratos
                    </ModuleButton>
                  </div>
                </div>
              </article>
            )}
          </aside>
          {!error && (
          <section
            id="chatRoom"
            className="grid h-[calc(100vh-260px)] min-h-[560px] min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-workly-rule bg-workly-card"
          >
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-workly-rule px-5 py-4">
              <span id="chatStatusLabel" className="order-2 shrink-0 rounded-full bg-workly-primary-tint px-2.5 py-0.5 text-xs font-semibold text-workly-primary-ink">
                {contract ? contractStatus(contract.status) : 'Contrato'}
              </span>
              <h2
                id="chatRoomTitle"
                className="order-1 min-w-0 truncate text-[1.125rem] font-semibold text-workly-ink-warm"
              >
                {contract?.nomeServico || 'Mensagens'}
              </h2>
              <p className="order-3 w-full truncate text-sm text-workly-muted-warm">
                {contract
                  ? `Conversa com ${otherUser(contract).nome || 'a outra parte'}`
                  : 'Carregando conversa...'}
              </p>
            </header>
            {error ? (
              <div id="chatMessages" />
            ) : (
              <MessageHistory
                direct
                messages={messages}
                error={messageError}
                sendError={sendError}
              />
            )}{' '}
            {!error && readOnly && (
              <p
                role="status"
                className="flex items-start gap-2 border-t border-workly-rule bg-workly-sunken px-5 py-4 text-[0.95rem] text-workly-ink-warm dark:border-white/10 dark:bg-workly-night"
              >
                <i aria-hidden="true" className="fas fa-lock mt-1 text-sm text-workly-muted-warm" />
                <span>
                  Este contrato foi encerrado. A conversa fica disponível para consulta, mas não é possível enviar novas
                  mensagens.
                </span>
              </p>
            )}
            {!error && !readOnly && (
              <MessageCompose direct text={text} setText={setText} busy={busy} onSend={send} />
            )}
          </section>
          )}
        </section>
      </ModulePage>
    </CatalogShell>
  );
}
