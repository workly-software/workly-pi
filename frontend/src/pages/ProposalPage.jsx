import { useEffect, useRef, useState } from 'react';
import { officeFor, serviceImage } from '../components/home/offices';
import { Link, useNavigate, useSearchParams } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import { LoadingState } from '../components/ui/Feedback';
import Button from '../components/ui/Button';
import { ModuleToast, useModuleToast } from '../components/ui/ModuleUI';
import { showAuthAlert } from '../components/auth/authPresentation';
import { buscarUsuarioAtual } from '../services/authService';
import { createContract } from '../services/contractService';
import {
  defaultServiceImage,
  defaultProfileImage,
  formatCurrency,
  serviceDetail,
  serviceRating
} from '../services/catalogService';

const label = 'mb-2 block text-sm font-medium text-workly-ink-warm';
const hint = 'text-[0.8125rem] leading-relaxed text-workly-muted-warm';
const control =
  'w-full min-w-0 rounded-md border border-workly-rule bg-workly-paper text-workly-ink-warm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-workly-muted-warm/80 focus:border-workly-forest focus:shadow-[0_0_0_3px_rgba(14,59,44,0.12)] dark:border-white/12 dark:bg-workly-night dark:focus:border-workly-dark-accent dark:focus:shadow-[0_0_0_3px_rgba(95,211,148,0.16)]';
const nextStep =
  'A proposta fica pendente em Contratos até o profissional aceitar ou recusar. Nada é cobrado nesta etapa.';
export default function ProposalPage() {
  const [params] = useSearchParams(),
    id = params.get('id'),
    navigate = useNavigate(),
    timer = useRef(null),
    [service, setService] = useState(null),
    [count, setCount] = useState(0),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    sending = useRef(false),
    [message, toast] = useModuleToast(2600);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) {
        navigate('/todos-servicos', { replace: true });
        return;
      }
      try {
        const user = await buscarUsuarioAtual(true).catch(() => null);
        const result = await serviceDetail(id);
        if (!active) return;
        if (user && String(user.idUsuario) === String(result.service.idUsuario)) {
          toast('Você não pode contratar o próprio serviço.');
          timer.current = setTimeout(() => navigate('/perfil'), 900);
          return;
        }
        setService(result.service);
      } catch (error) {
        if (active) {
          toast(error.message || 'Erro ao carregar serviço.');
          timer.current = setTimeout(() => navigate('/todos-servicos'), 1100);
        }
      }
    })();
    return () => {
      active = false;
      clearTimeout(timer.current);
    };
  }, [id, navigate]);
  async function submit(event) {
    event.preventDefault();
    if (!service || sending.current || sent) return;
    const fd = new FormData(event.currentTarget),
      mensagem = String(fd.get('mensagem') || '').trim();
    if (!mensagem) {
      toast('Escreva uma mensagem para o freelancer.');
      return;
    }
    sending.current = true;
    setBusy(true);
    let response;
    try {
      response = await createContract({ servicoId: id, precoProposto: fd.get('precoProposto'), mensagem });
    } catch (error) {
      sending.current = false;
      setBusy(false);
      if (error.status === 409) {
        const result = await showAuthAlert({
          icon: 'warning',
          symbol: 'fa-file-signature',
          title: 'Você já tem uma proposta ativo',
          text: error.message || 'Já existe uma contratação ativa para este serviço.',
          confirmText: 'Ver contratos',
          cancelText: 'Fechar'
        });
        if (result.isConfirmed) navigate('/contratos', { replace: true });
        return;
      }
      await showAuthAlert({
        icon: 'error',
        title: 'Proposta não enviada',
        text: error.message || 'Não foi possível enviar a proposta. Seus dados continuam no formulário.'
      });
      return;
    }
    setSent(true);
    const contractId = response?.dados?.idContrato;
    const result = await showAuthAlert({
      icon: 'success',
      symbol: 'fa-paper-plane',
      title: 'Proposta enviada',
      text: 'Agora é aguardar a resposta do profissional. Você acompanha o retorno e conversa pelo chat em Contratos.',
      confirmText: contractId ? 'Ver contrato' : 'Ver contratos',
      cancelText: 'Voltar ao serviço'
    });
    if (result.isDismissed && result.dismiss === 'cancel') {
      navigate(`/detalhe-servico?id=${encodeURIComponent(id)}`, { replace: true });
      return;
    }
    navigate(contractId ? `/contratos?contrato=${encodeURIComponent(contractId)}` : '/contratos', {
      replace: true
    });
  }
  const office = service ? officeFor(service) : null;
  const rating = service ? serviceRating(service) : '';
  const basePrice = service
    ? service.valorCombinar
      ? 'Valor a combinar'
      : formatCurrency(service.preco || 0)
    : '';
  const image = serviceImage(service, defaultServiceImage);
  const imageFallback = (event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = defaultServiceImage;
  };
  const toCombine = Boolean(service?.valorCombinar);
  return (
    <CatalogShell title="Negociar Serviço">
      <main className="bg-workly-paper px-10 pt-8 pb-20 text-workly-ink-warm legacy-max-720:px-5 legacy-max-720:pt-5 dark:bg-workly-night">
        <div className="mx-auto max-w-[1200px]">
          <Link
            to={`/detalhe-servico?id=${encodeURIComponent(id || '')}`}
            className="-ml-2 inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-workly-muted-warm transition-colors hover:text-workly-ink-warm"
          >
            <i aria-hidden="true" className="fas fa-arrow-left text-xs" />
            Voltar ao serviço
          </Link>
          <header className="mt-4 mb-10 max-w-[640px] legacy-max-720:mb-6">
            <p className="text-xs font-semibold tracking-[0.08em] text-workly-primary-ink uppercase dark:text-workly-dark-accent">
              Proposta
            </p>
            <h1
              id="proposal-title"
              className="mt-2 font-workly-display text-[clamp(2rem,3.6vw,2.75rem)] leading-[1.04] font-semibold tracking-[-0.025em] [font-variation-settings:'opsz'_96]"
            >
              {toCombine ? 'Combine o valor do serviço' : 'Envie sua proposta'}
            </h1>
            <p className="mt-3 leading-relaxed text-workly-muted-warm">
              {toCombine
                ? 'Este serviço não tem preço fechado. Conte o que você precisa para o profissional avaliar e responder.'
                : 'Sugira um valor, se quiser, e explique o que precisa. O profissional aceita ou recusa a proposta.'}
            </p>
          </header>
          <div className="grid items-start gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <aside
              aria-label="Resumo do serviço"
              className="rounded-xl border border-workly-rule bg-workly-card lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 dark:border-white/10"
            >
              {service ? (
                <>
                  <img
                    id="service-image"
                    src={image}
                    alt=""
                    onError={imageFallback}
                    className="hidden aspect-[16/10] w-full rounded-t-xl object-cover lg:block"
                  />
                  <div className="p-4 lg:p-6">
                    <div className="flex items-center gap-4 lg:block">
                      <img
                        src={image}
                        alt=""
                        onError={imageFallback}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover lg:hidden"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-workly-muted-warm">
                          {office?.label || service.nomeCategoria || 'Serviço'}
                        </p>
                        <h2 id="service-title" className="mt-1 line-clamp-2 leading-snug font-semibold">
                          {service.nome}
                        </h2>
                        <p className="mt-0.5 truncate text-sm text-workly-muted-warm lg:hidden">
                          {service.nomeFreelancer || 'Freelancer'}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-sm font-semibold tabular-nums lg:hidden">{basePrice}</p>
                    </div>
                    <dl className="mt-5 hidden gap-2.5 border-t border-workly-rule pt-5 text-sm lg:grid dark:border-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-workly-muted-warm">Profissional</dt>
                        <dd className="flex min-w-0 items-center gap-2 font-medium">
                          <img
                            src={service.fotoPerfil || defaultProfileImage}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.onerror = null;
                              event.currentTarget.src = defaultProfileImage;
                            }}
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                          <span className="truncate">{service.nomeFreelancer || 'Freelancer'}</span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-workly-muted-warm">Avaliação</dt>
                        <dd className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                          {rating !== 'Sem avaliações' && (
                            <i aria-hidden="true" className="fas fa-star text-xs text-[#b7791f] dark:text-[#f2c14e]" />
                          )}
                          {rating}
                        </dd>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-workly-rule pt-4 dark:border-white/10">
                        <dt className="text-workly-muted-warm">{toCombine ? 'Preço' : 'Valor base'}</dt>
                        <dd className="font-workly-display text-[1.375rem] leading-none font-semibold tabular-nums [font-variation-settings:'opsz'_32]">
                          {basePrice}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-5 hidden gap-3 border-t border-workly-rule pt-5 text-[0.8125rem] leading-relaxed text-workly-muted-warm lg:flex dark:border-white/10">
                      <i aria-hidden="true" className="fas fa-paper-plane mt-[3px] w-4 shrink-0 text-center text-workly-primary-ink dark:text-workly-dark-accent" />
                      <span>{nextStep}</span>
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <LoadingState message="Carregando serviço..." detail="" />
                </div>
              )}
            </aside>
            <form
              id="proposal-form"
              onSubmit={submit}
              className="rounded-xl border border-workly-rule bg-workly-card p-8 lg:col-start-1 lg:row-start-1 legacy-max-720:p-5 dark:border-white/10"
            >
              <div className="max-w-[320px]">
                <label htmlFor="precoProposto" className={label}>
                  Valor proposto <span className="font-normal text-workly-muted-warm">(opcional)</span>
                </label>
                <div className={`${control} flex h-12 items-center gap-2 px-3.5 focus-within:border-workly-forest focus-within:shadow-[0_0_0_3px_rgba(14,59,44,0.12)] dark:focus-within:border-workly-dark-accent`}>
                  <span className="text-sm text-workly-muted-warm">R$</span>
                  <input
                    id="precoProposto"
                    name="precoProposto"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="150,00"
                    disabled={sent}
                    className="h-full min-w-0 flex-1 bg-transparent font-medium tabular-nums outline-none"
                  />
                </div>
                <p className={`${hint} mt-2`}>
                  {toCombine
                    ? 'Sugira um orçamento inicial, se tiver um em mente.'
                    : 'Deixe em branco para manter o valor base.'}
                </p>
              </div>
              <div className="mt-7">
                <label htmlFor="mensagem" className={label}>
                  Mensagem para o profissional <span className="text-workly-primary-ink dark:text-workly-dark-accent" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="mensagem"
                  name="mensagem"
                  rows="7"
                  maxLength="600"
                  required
                  disabled={sent}
                  aria-describedby="proposalHint"
                  placeholder="Explique o que você precisa, o prazo desejado e referências importantes."
                  onChange={(event) => setCount(event.target.value.length)}
                  className={`${control} block min-h-[180px] resize-y px-4 py-3.5 leading-relaxed`}
                />
                <div className="mt-2 flex justify-between gap-4">
                  <p id="proposalHint" className={hint}>
                    Escopo, prazo e o que você já tem pronto ajudam na resposta.
                  </p>
                  <span id="char-count" className={`${hint} shrink-0 tabular-nums`}>
                    {count}/600
                  </span>
                </div>
              </div>
              <p className="mt-8 flex gap-3 text-[0.8125rem] leading-relaxed text-workly-muted-warm lg:hidden">
                <i aria-hidden="true" className="fas fa-paper-plane mt-[3px] w-4 shrink-0 text-center text-workly-primary-ink dark:text-workly-dark-accent" />
                <span>{nextStep}</span>
              </p>
              <div className="mt-8 flex items-center justify-end gap-3 border-t border-workly-rule pt-6 legacy-max-720:mt-6 legacy-max-720:flex-col-reverse legacy-max-720:items-stretch dark:border-white/10">
                <Link
                  to={`/detalhe-servico?id=${encodeURIComponent(id || '')}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-md px-5 text-[0.95rem] font-semibold text-workly-muted-warm transition-colors hover:bg-workly-sunken hover:text-workly-ink-warm dark:hover:bg-white/5"
                >
                  Cancelar
                </Link>
                <Button
                  appearance="custom"
                  type="submit"
                  disabled={busy || sent}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-workly-forest px-7 text-[0.95rem] font-semibold text-workly-on-forest transition-[background-color,transform] duration-150 hover:bg-workly-forest-raised motion-safe:active:scale-[0.98] disabled:opacity-60 dark:bg-workly-dark-accent dark:text-workly-night dark:hover:bg-[#6ee7a0]"
                >
                  {busy && !sent ? (
                    <>
                      <i aria-hidden="true" className="fas fa-spinner fa-spin" />
                      <LoadingState inline message="Enviando..." />
                    </>
                  ) : sent ? (
                    'Proposta enviada'
                  ) : (
                    'Enviar proposta'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
      <ModuleToast message={message} />
    </CatalogShell>
  );
}
