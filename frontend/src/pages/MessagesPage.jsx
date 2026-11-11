import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import Button from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { ModuleButton } from '../components/ui/ModuleUI';
import MessageHistory from '../components/messages/MessageHistory';
import MessageCompose from '../components/messages/MessageCompose';
import ContractDetails from '../components/messages/ContractDetails';
import { myContracts, contractStatus } from '../services/contractService';
import {
  activeChatStatuses,
  contractId,
  otherUser,
  messageSummaries,
  conversationPreviews,
  contractMessages,
  sendContractMessage
} from '../services/messageService';
import { defaultProfileImage } from '../services/catalogService';
import { obterUsuario } from '../services/authService';
import { markNotificationRead } from '../services/notificationService';

function ConversationEmpty({ title, message, error = false, children }) {
  const Component = error ? ErrorState : EmptyState;
  return (
    <Component className="grid min-h-[220px] content-center justify-items-center gap-2 p-7 text-center text-sm text-workly-muted-warm">
      <i
        aria-hidden="true"
        className={`fas ${error ? 'fa-triangle-exclamation' : title === 'Nenhuma conversa encontrada' ? 'fa-magnifying-glass' : 'fa-comments'} text-xl text-workly-muted-warm`}
      />
      <strong className="text-workly-ink-warm dark:text-[#ecebe5]">{title}</strong>
      <span>{message}</span>
      {children}
    </Component>
  );
}
export default function MessagesPage() {
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate(),
    [contracts, setContracts] = useState(null),
    [previews, setPreviews] = useState({}),
    [selected, setSelected] = useState(''),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [messages, setMessages] = useState(null),
    [messageError, setMessageError] = useState(''),
    [sendError, setSendError] = useState(''),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [details, setDetails] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const requested = params.get('contrato') || params.get('id'),
    context = params.get('notificacoes');
  useEffect(() => {
    let active = true;
    (async () => {
      if (context === 'mensagens')
        try {
          await markNotificationRead({ contexto: 'mensagens' });
          window.dispatchEvent(new Event('workly:notifications'));
        } catch (error) {
          console.error('Erro ao limpar notificações de mensagens:', error);
        }
      try {
        const all = (await myContracts()).filter((c) => activeChatStatuses.includes(c.status));
        if (!active) return;
        let summaries = [],
          failed = false;
        try {
          summaries = await messageSummaries();
        } catch {
          failed = true;
        }
        if (!active) return;
        setContracts(all);
        setPreviews(conversationPreviews(all, summaries, obterUsuario() || {}, failed));
        const narrow = window.matchMedia('(max-width: 980px)').matches;
        const initial =
          all.find((c) => contractId(c) === requested) || (narrow ? undefined : all[0]);
        setSelected(initial ? contractId(initial) : '');
      } catch (error) {
        if (active) {
          setError(error.message);
          setContracts([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [context]);
  useEffect(() => {
    if (!contracts?.length || !requested) return;
    const c = contracts.find((c) => contractId(c) === requested);
    if (c) setSelected(contractId(c));
  }, [requested, contracts]);
  const active = contracts?.find((c) => contractId(c) === selected);
  useEffect(() => {
    let mounted = true;
    if (!selected) return;
    setText('');
    setSendError('');
    setDetails(false);
    setBusy(false);
    setPreviews((value) => ({ ...value, [selected]: { ...value[selected], unread: 0 } }));
    const next = new URLSearchParams(params);
    next.set('contrato', selected);
    navigate(
      { pathname: location.pathname, search: '?' + next.toString(), hash: location.hash },
      { replace: true }
    );
    async function load() {
      try {
        const value = await contractMessages(selected);
        if (mounted) {
          setMessages(value);
          setMessageError('');
        }
      } catch (error) {
        if (mounted) setMessageError(error.message);
      }
    }
    setMessages(null);
    setMessageError('');
    load();
    const timer = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [selected]);
  const closeDetails = useCallback(() => setDetails(false), []);
  async function send(value) {
    const id = selected;
    setBusy(true);
    setSendError('');
    try {
      await sendContractMessage(id, value);
      if (selectedRef.current !== id) return;
      setPreviews((current) => ({
        ...current,
        [id]: {
          text: value,
          mine: true,
          date: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          unread: 0
        }
      }));
      setText('');
      const result = await contractMessages(id);
      if (selectedRef.current === id) {
        setMessages(result);
        setMessageError('');
      }
    } catch (error) {
      if (selectedRef.current === id)
        setSendError(error.message || 'Não foi possível enviar a mensagem.');
    } finally {
      if (selectedRef.current === id) setBusy(false);
    }
  }
  const term = search.trim().toLowerCase(),
    filtered = (contracts || []).filter((c) =>
      [
        c.nomeServico,
        c.descricaoServico,
        otherUser(c).nome,
        contractStatus(c.status),
        previews[contractId(c)]?.text
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(term)
      )
    );
  const statusTone =
    active?.status === 'em_andamento' || active?.status === 'proposta_aceita'
      ? 'bg-workly-primary-tint text-workly-primary-ink'
      : 'bg-[#fdf3e2] text-[#8a5000] dark:bg-[#f2c14e]/15 dark:text-[#f2c14e]';
  return (
    <CatalogShell title="Mensagens" footer="empty" showCategories={false} headerSearch={false}>
      <main className="mx-auto w-full max-w-[1280px] px-10 pt-8 pb-10 legacy-max-720:px-0 legacy-max-720:pt-0 legacy-max-720:pb-0">
        <section className="grid h-[calc(100dvh-160px)] min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-lg border border-workly-rule bg-workly-card  legacy-max-980:grid-cols-1 legacy-max-720:h-[calc(100dvh-70px)] legacy-max-720:min-h-0 legacy-max-720:rounded-none legacy-max-720:border-0">
          <aside
            className={`grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] border-r border-workly-rule legacy-max-980:border-r-0 ${active ? 'legacy-max-980:hidden' : ''}`}
          >
            <div className="min-w-0 border-b border-workly-rule px-5 pt-5 pb-4">
              <h1 className="text-[1.375rem] leading-tight font-semibold text-workly-ink-warm">Mensagens</h1>
              <p className="mt-1 mb-4 text-sm text-workly-muted-warm">Converse dentro dos contratos ativos.</p>
              <label className="flex h-11 items-center gap-2.5 rounded-md border border-workly-rule bg-workly-paper px-3 transition-[border-color,box-shadow] focus-within:border-workly-forest focus-within:shadow-[0_0_0_3px_rgba(14,59,44,0.14)] dark:focus-within:border-workly-dark-accent">
                <i aria-hidden="true" className="fas fa-search text-sm text-workly-muted-warm" />
                <input
                  id="conversationSearch"
                  type="search"
                  aria-label="Buscar conversa"
                  placeholder="Buscar por serviço ou pessoa"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-workly-ink-warm outline-none placeholder:text-workly-muted-warm focus-visible:outline-none"
                />
              </label>
            </div>
            <div id="conversationList" className="min-h-0 overflow-y-auto p-2">
              {error ? (
                <ConversationEmpty error title="Erro ao carregar conversas" message={error} />
              ) : contracts === null ? (
                <LoadingState
                  inline
                  message="Carregando conversas…"
                  className="grid min-h-[220px] content-center p-7 text-center text-workly-muted-warm"
                />
              ) : !contracts.length ? (
                <ConversationEmpty
                  title="Nenhuma conversa ativa"
                  message="As conversas aparecem aqui quando houver um contrato ativo."
                >
                  <ModuleButton to="/todos-servicos">Explorar serviços</ModuleButton>
                </ConversationEmpty>
              ) : !filtered.length ? (
                <ConversationEmpty
                  title="Nenhuma conversa encontrada"
                  message="Tente buscar pelo nome do serviço ou da pessoa."
                />
              ) : (
                <ul className="grid gap-0.5">
                  {filtered.map((c) => {
                    const id = contractId(c),
                      other = otherUser(c),
                      preview = previews[id] || {
                        text: c.mensagem || 'Nenhuma mensagem ainda.',
                        unread: 0
                      },
                      chosen = id === selected;
                    return (
                      <li key={id} className="min-w-0">
                        <button
                          type="button"
                          data-conversation={id}
                          aria-pressed={chosen}
                          onClick={() => {
                            setSelected(id);
                            setPreviews((value) => ({ ...value, [id]: { ...value[id], unread: 0 } }));
                            if (chosen)
                              contractMessages(id)
                                .then(setMessages)
                                .catch((error) => setMessageError(error.message));
                          }}
                          className={`block w-full min-w-0 rounded-md px-3 py-3 text-left transition-colors ${chosen ? 'bg-workly-sunken shadow-[inset_3px_0_0_var(--color-workly-forest)] dark:shadow-[inset_3px_0_0_var(--color-workly-dark-accent)]' : 'hover:bg-workly-paper'}`}
                        >
                          <span className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3">
                            <img
                              src={other.fotoPerfil || other.foto_perfil || defaultProfileImage}
                              alt=""
                              onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = defaultProfileImage;
                              }}
                              className="h-10 w-10 rounded-full bg-workly-sunken object-cover"
                            />
                            <span className="grid min-w-0 gap-0.5">
                              <span className="flex min-w-0 items-baseline gap-2">
                                <strong className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold text-workly-ink-warm">
                                  {other.nome || 'Usuário'}
                                </strong>
                                {preview.date && (
                                  <small className="shrink-0 text-xs text-workly-muted-warm tabular-nums">
                                    {preview.date}
                                  </small>
                                )}
                              </span>
                              <span className="truncate text-[0.8rem] text-workly-muted-warm">
                                {c.nomeServico || 'Serviço'}
                              </span>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-[0.85rem] text-workly-ink-warm/80">
                                  {preview.mine ? 'Você: ' : ''}
                                  {preview.text || 'Nenhuma mensagem ainda.'}
                                </span>
                                {preview.unread > 0 && (
                                  <span
                                    aria-label={`${preview.unread} mensagem${preview.unread > 1 ? 's' : ''} não lida${preview.unread > 1 ? 's' : ''}`}
                                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-workly-forest px-1.5 text-[0.7rem] font-semibold text-workly-on-forest dark:bg-workly-dark-accent dark:text-workly-night"
                                  >
                                    {preview.unread > 9 ? '9+' : preview.unread}
                                  </span>
                                )}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
          <section
            id="messagePanel"
            className={`min-h-0 min-w-0 bg-workly-paper ${active ? '' : 'legacy-max-980:hidden'}`}
          >
            {active ? (
              <article className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">
                <header className="flex items-center gap-3 border-b border-workly-rule bg-workly-card px-6 py-4 legacy-max-720:px-4">
                  <button
                    type="button"
                    onClick={() => setSelected('')}
                    aria-label="Voltar para conversas"
                    className="hidden h-10 w-10 shrink-0 place-items-center rounded-full text-workly-muted-warm hover:bg-workly-sunken legacy-max-980:grid"
                  >
                    <i aria-hidden="true" className="fas fa-arrow-left" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="min-w-0 truncate text-[1.125rem] font-semibold text-workly-ink-warm">
                        {active.nomeServico || 'Contrato'}
                      </h2>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>
                        {contractStatus(active.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-workly-muted-warm">
                      Conversa com <span className="font-medium text-workly-ink-warm">{otherUser(active).nome || 'Usuário'}</span>
                    </p>
                  </div>
                  <Button
                    appearance="custom"
                    id="openContractDetails"
                    onClick={() => setDetails(true)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-workly-rule bg-workly-card px-3.5 text-sm font-semibold text-workly-ink-warm transition-colors hover:border-workly-forest/40"
                  >
                    <i aria-hidden="true" className="fas fa-circle-info" />
                    <span className="legacy-max-480:sr-only">Detalhes</span>
                  </Button>
                </header>
                <MessageHistory messages={messages} error={messageError} sendError={sendError} />
                <MessageCompose
                  key={selected}
                  text={text}
                  setText={setText}
                  busy={busy}
                  onSend={send}
                />
              </article>
            ) : (
              <EmptyState className="grid h-full content-center justify-items-center gap-3 p-12 text-center text-workly-muted-warm">
                <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-workly-primary-tint text-xl text-workly-primary-ink">
                  <i className="fas fa-message" />
                </span>
                <h2 className="text-[1.25rem] font-semibold text-workly-ink-warm">Selecione uma conversa</h2>
                <p className="max-w-[40ch] leading-relaxed">
                  Escolha um contrato ativo para ver o histórico e enviar mensagens.
                </p>
              </EmptyState>
            )}
          </section>
        </section>
      </main>
      {details && active && <ContractDetails contract={active} onClose={closeDetails} />}
    </CatalogShell>
  );
}
