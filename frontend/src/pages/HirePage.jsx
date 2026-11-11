import { useEffect, useRef, useState } from 'react';
import { officeFor, serviceImage } from '../components/home/offices';
import { Link, useNavigate, useSearchParams } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import Button from '../components/ui/Button';
import { LoadingState } from '../components/ui/Feedback';
import { showAuthAlert } from '../components/auth/authPresentation';
import { createContract } from '../services/contractService';
import {
  defaultServiceImage,
  formatCurrency,
  serviceDetail,
  serviceRating
} from '../services/catalogService';

const label = 'mb-2 block text-sm font-medium text-workly-ink-warm';
const hint = 'text-[0.8125rem] leading-relaxed text-workly-muted-warm';
const control =
  'w-full min-w-0 rounded-md border border-workly-rule bg-workly-paper text-workly-ink-warm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-workly-muted-warm/80 focus:border-workly-forest focus:shadow-[0_0_0_3px_rgba(14,59,44,0.12)] dark:border-white/12 dark:bg-workly-night dark:focus:border-workly-dark-accent dark:focus:shadow-[0_0_0_3px_rgba(95,211,148,0.16)]';
const examples = {
  1: 'Ex: Preciso de uma identidade visual para uma cafeteria de bairro: logotipo, paleta de cores e versões para redes sociais. O público é jovem e o tom deve ser acolhedor.',
  2: 'Ex: Meu site em WordPress apresenta erro no formulário de contato e lentidão no celular. Preciso do diagnóstico, da correção e de um resumo do que foi alterado.',
  3: 'Ex: Tenho 40 minutos de gravação de um podcast e preciso de 5 cortes verticais com legenda para Reels e TikTok, com cortes secos e trilha discreta.',
  4: 'Ex: Tenho planilhas mensais de vendas de 2024 e quero entender quais produtos e regiões mais cresceram, com gráficos e um resumo das principais conclusões.',
  5: 'Ex: Preciso traduzir um manual de 12 páginas do inglês para o português, mantendo os termos técnicos e a formatação do arquivo original.',
  6: 'Ex: Preciso de fotos de 20 produtos de uma loja de cosméticos em fundo neutro, prontas para e-commerce, com duas variações de ângulo por produto.',
  7: 'Ex: Preciso mixar e masterizar três faixas de um EP de rock, com volume equilibrado para plataformas de streaming. Envio as trilhas separadas.'
};
const fallbackExample =
  'Ex: Descreva o resultado que você espera, para quem é o trabalho, o que já existe e o que deve ser entregue ao final.';
const nextStep =
  'Ao confirmar, o pedido vai para o profissional e passa a ser acompanhado em Contratos. Nada é cobrado nesta etapa.';
export default function HirePage() {
  const [params] = useSearchParams(),
    id = params.get('id'),
    navigate = useNavigate(),
    details = useRef(null),
    [service, setService] = useState(null),
    [length, setLength] = useState(0),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    sending = useRef(false);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) {
        await showAuthAlert({
          icon: 'error',
          title: 'Serviço não informado',
          text: 'Volte para a página do serviço e tente novamente.'
        });
        if (active) navigate('/todos-servicos', { replace: true });
        return;
      }
      try {
        const result = await serviceDetail(id);
        if (active) setService(result.service);
      } catch (error) {
        if (!active) return;
        await showAuthAlert({
          icon: 'error',
          title: 'Erro ao carregar',
          text: error.message || 'Não foi possível carregar o serviço.'
        });
        if (active) navigate('/todos-servicos', { replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [id, navigate]);
  const cancel = () =>
    history.length > 1 ? navigate(-1) : navigate(`/detalhe-servico?id=${encodeURIComponent(id)}`);
  async function submit(event) {
    event.preventDefault();
    if (!service || sending.current || sent) return;
    const fd = new FormData(event.currentTarget),
      detalhesPedido = String(fd.get('detalhesPedido') || '').trim();
    if (detalhesPedido.length < 20) {
      await showAuthAlert({
        icon: 'warning',
        title: 'Detalhe um pouco mais',
        text: 'Escreva pelo menos 20 caracteres para o freelancer entender melhor o pedido.'
      });
      details.current?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    let response;
    try {
      response = await createContract({
        servicoId: id,
        detalhesPedido,
        prazoDesejado: String(fd.get('prazoDesejado') || '').trim(),
        referencias: String(fd.get('referencias') || '').trim()
      });
    } catch (error) {
      sending.current = false;
      setBusy(false);
      if (error.status === 409) {
        const result = await showAuthAlert({
          icon: 'warning',
          symbol: 'fa-file-signature',
          title: 'Você já tem um pedido ativo',
          text: error.message || 'Já existe uma contratação ativa para este serviço.',
          confirmText: 'Ver contratos',
          cancelText: 'Fechar'
        });
        if (result.isConfirmed) navigate('/contratos', { replace: true });
        return;
      }
      await showAuthAlert({
        icon: 'error',
        title: 'Pedido não enviado',
        text: error.message || 'Não foi possível criar o pedido. Seus dados continuam no formulário.'
      });
      return;
    }
    setSent(true);
    const created = response?.dados || {};
    const proposal = created.status === 'proposta_pendente';
    const contractId = created.idContrato;
    const result = await showAuthAlert({
      icon: 'success',
      symbol: proposal ? 'fa-paper-plane' : 'fa-file-signature',
      title: proposal ? 'Proposta enviada' : 'Pedido criado',
      text: proposal
        ? 'Agora é aguardar a resposta do profissional. Você acompanha o retorno em Contratos.'
        : 'O profissional foi avisado. Acompanhe o andamento, as entregas e o chat pelo contrato.',
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
  const price = service
    ? service.valorCombinar
      ? 'Valor a combinar'
      : formatCurrency(service.preco)
    : '';
  const image = service ? serviceImage(service, defaultServiceImage) : '';
  const imageFallback = (event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = defaultServiceImage;
  };
  return (
    <CatalogShell title="Detalhes da contratação">
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
              Contratação
            </p>
            <h1 className="mt-2 font-workly-display text-[clamp(2rem,3.6vw,2.75rem)] leading-[1.04] font-semibold tracking-[-0.025em] [font-variation-settings:'opsz'_96]">
              Finalize o pedido
            </h1>
            <p className="mt-3 leading-relaxed text-workly-muted-warm">
              Conte o essencial para o profissional entender o objetivo, o prazo e as referências antes de começar.
            </p>
          </header>
          <div className="grid items-start gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <aside
              aria-label="Resumo da contratação"
              className="rounded-xl border border-workly-rule bg-workly-card lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 dark:border-white/10"
            >
              {service ? (
                <>
                  <img
                    src={image}
                    alt=""
                    onError={imageFallback}
                    className="hidden aspect-[16/10] w-full rounded-t-xl object-cover lg:block"
                  />
                  <div id="servicePreview" className="p-4 lg:p-6">
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
                        <h2 className="mt-1 line-clamp-2 leading-snug font-semibold">{service.nome}</h2>
                        <p className="mt-0.5 truncate text-sm text-workly-muted-warm lg:hidden">
                          {service.nomeFreelancer || 'Freelancer'}
                        </p>
                      </div>
                      <p className="shrink-0 text-right font-semibold tabular-nums lg:hidden">{price}</p>
                    </div>
                    <dl className="mt-5 hidden gap-2.5 border-t border-workly-rule pt-5 text-sm lg:grid dark:border-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-workly-muted-warm">Profissional</dt>
                        <dd className="truncate font-medium">{service.nomeFreelancer || 'Freelancer'}</dd>
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
                        <dt className="text-workly-muted-warm">Valor</dt>
                        <dd className="font-workly-display text-[1.5rem] leading-none font-semibold tabular-nums [font-variation-settings:'opsz'_32]">
                          {price}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-5 hidden gap-3 border-t border-workly-rule pt-5 text-[0.8125rem] leading-relaxed text-workly-muted-warm lg:flex dark:border-white/10">
                      <i aria-hidden="true" className="fas fa-file-signature mt-[3px] w-4 shrink-0 text-center text-workly-primary-ink dark:text-workly-dark-accent" />
                      <span>{nextStep}</span>
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <LoadingState message="Carregando resumo..." detail="" />
                </div>
              )}
            </aside>
            <form
              id="hireDetailsForm"
              onSubmit={submit}
              className="rounded-xl border border-workly-rule bg-workly-card p-8 lg:col-start-1 lg:row-start-1 legacy-max-720:p-5 dark:border-white/10"
            >
              <div>
                <label className={label} htmlFor="detalhesPedido">
                  O que você precisa? <span className="text-workly-primary-ink dark:text-workly-dark-accent" aria-hidden="true">*</span>
                </label>
                <textarea
                  ref={details}
                  id="detalhesPedido"
                  name="detalhesPedido"
                  rows="7"
                  minLength="20"
                  maxLength="900"
                  required
                  disabled={sent}
                  aria-describedby="detailsHint"
                  onChange={(event) => setLength(event.target.value.length)}
                  placeholder={examples[office?.id] || fallbackExample}
                  className={`${control} block min-h-[188px] resize-y px-4 py-3.5 leading-relaxed`}
                />
                <div className="mt-2 flex justify-between gap-4">
                  <p id="detailsHint" className={hint}>
                    Objetivo, público, material disponível e restrições. Mínimo de 20 caracteres.
                  </p>
                  <span id="detailsCounter" className={`${hint} shrink-0 tabular-nums`}>
                    {length}/900
                  </span>
                </div>
              </div>
              <div className="mt-7 grid gap-x-5 gap-y-7 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="prazoDesejado">
                    Prazo desejado
                  </label>
                  <select id="prazoDesejado" name="prazoDesejado" className={`${control} h-12 px-3.5`}>
                    <option value="">Sem prazo definido</option>
                    {[
                      'Urgente: 2 a 3 dias',
                      'Até 7 dias',
                      'Até 15 dias',
                      'Sem pressa',
                      'A combinar com o freelancer'
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value === 'Urgente: 2 a 3 dias' ? 'Urgente — 2 a 3 dias' : value}
                      </option>
                    ))}
                  </select>
                  <p className={`${hint} mt-2`}>Prazos curtos podem exigir ajuste de escopo.</p>
                </div>
                <div>
                  <label className={label} htmlFor="referencias">
                    Referências ou links <span className="font-normal text-workly-muted-warm">(opcional)</span>
                  </label>
                  <input
                    id="referencias"
                    name="referencias"
                    maxLength="240"
                    placeholder="https://"
                    className={`${control} h-12 px-3.5`}
                  />
                  <p className={`${hint} mt-2`}>Exemplos de estilo, arquivos ou trabalhos de que você gosta.</p>
                </div>
              </div>
              <p className="mt-8 flex gap-3 text-[0.8125rem] leading-relaxed text-workly-muted-warm lg:hidden">
                <i aria-hidden="true" className="fas fa-file-signature mt-[3px] w-4 shrink-0 text-center text-workly-primary-ink dark:text-workly-dark-accent" />
                <span>{nextStep}</span>
              </p>
              <div className="mt-8 flex items-center justify-end gap-3 border-t border-workly-rule pt-6 legacy-max-720:mt-6 legacy-max-720:flex-col-reverse legacy-max-720:items-stretch dark:border-white/10">
                <Button
                  appearance="custom"
                  type="button"
                  onClick={cancel}
                  className="inline-flex min-h-11 items-center justify-center rounded-md px-5 text-[0.95rem] font-semibold text-workly-muted-warm transition-colors hover:bg-workly-sunken hover:text-workly-ink-warm dark:hover:bg-white/5"
                >
                  Cancelar
                </Button>
                <Button
                  appearance="custom"
                  type="submit"
                  disabled={busy || sent}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-workly-forest px-7 text-[0.95rem] font-semibold text-workly-on-forest transition-[background-color,transform] duration-150 hover:bg-workly-forest-raised motion-safe:active:scale-[0.98] disabled:opacity-60 dark:bg-workly-dark-accent dark:text-workly-night dark:hover:bg-[#6ee7a0]"
                >
                  {busy && !sent ? (
                    <>
                      <i aria-hidden="true" className="fas fa-spinner fa-spin" />
                      <LoadingState inline message="Criando pedido..." />
                    </>
                  ) : sent ? (
                    'Pedido enviado'
                  ) : (
                    'Confirmar pedido'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </CatalogShell>
  );
}
