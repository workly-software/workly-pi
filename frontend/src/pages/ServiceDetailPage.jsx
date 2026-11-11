import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import { assignCovers, officeFor } from '../components/home/offices';
import ServiceCard from '../components/catalog/ServiceCard';
import Button from '../components/ui/Button';
import { ErrorState } from '../components/ui/Feedback';
import { buscarUsuarioAtual, sessaoIniciada } from '../services/authService';
import {
  categoryLabel,
  serviceDetail,
  categoryServices,
  favoriteStatus,
  updateFavorite,
  defaultServiceImage,
  defaultProfileImage,
  formatCurrency,
  serviceDate,
  serviceSummary
} from '../services/catalogService';

const surface = 'border border-workly-rule bg-workly-card dark:border-white/10 dark:bg-workly-night-raised';
const action =
  'inline-flex min-h-12 w-full items-center justify-center gap-[9px] rounded-md text-[0.95rem] font-semibold transition-[background-color,border-color,transform] duration-150 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-[0.72] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workly-primary';
function fallbackImage(event, fallback) {
  if (event.currentTarget.src !== new URL(fallback, location.origin).href)
    event.currentTarget.src = fallback;
}
function Description({ title, kicker, children }) {
  return (
    <article className="border-t border-workly-rule pt-6">
      <div className="mb-4">
        <span className="sr-only">
          {kicker}
        </span>
        <h2 className="text-[1.25rem] leading-[1.2] font-semibold text-workly-ink-warm dark:text-workly-dark-text">
          {title}
        </h2>
      </div>
      <p className="max-w-[68ch] text-[1rem] leading-[1.8] break-words whitespace-pre-line text-workly-ink-warm/85">
        {children}
      </p>
    </article>
  );
}

export default function ServiceDetailPage() {
  const [params] = useSearchParams(),
    id = params.get('id'),
    navigate = useNavigate();
  const [data, setData] = useState(null),
    [user, setUser] = useState(null),
    [error, setError] = useState(null);
  const [saved, setSaved] = useState(false),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(null),
    [related, setRelated] = useState([]);
  const toastTimer = useRef(null),
    redirectTimer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(redirectTimer.current);
    },
    []
  );
  function notify(title, message, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ title, message, type });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    setData(null);
    setError(null);
    setSaved(false);
    if (!id) {
      setError({
        title: 'Serviço não informado',
        message: 'Não encontramos o identificador do serviço na URL.'
      });
      return () => {
        mounted = false;
      };
    }
    (async () => {
      const currentUser = await buscarUsuarioAtual(true);
      if (!mounted) return;
      setUser(currentUser);
      try {
        const result = await serviceDetail(id, { signal: controller.signal });
        if (!mounted) return;
        setData(result);
        if (sessaoIniciada()) {
          try {
            const value = await favoriteStatus(result.service.idServico || id);
            if (mounted) setSaved(value);
          } catch {
            if (mounted) setSaved(false);
          }
        }
      } catch (err) {
        if (mounted && err.name !== 'AbortError')
          setError({
            title: 'Serviço não encontrado',
            message: err.message || 'Não foi possível carregar este serviço.'
          });
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(redirectTimer.current);
    };
  }, [id]);
  const service = data?.service || {},
    raw = data?.raw || {};
  const name = data ? service.nome || 'Serviço sem título' : 'Carregando serviço...';
  const category = data
    ? categoryLabel(service.nomeCategoria) || 'Categoria não informada'
    : 'Carregando…';
  const seller = data ? service.nomeFreelancer || 'Freelancer Workly' : 'Carregando freelancer...';
  const description = data
    ? raw.descricao ||
      service.descricao ||
      'O freelancer ainda não adicionou uma descrição para este serviço.'
    : 'Carregando descrição...';
  const owner = Boolean(user && String(user.idUsuario) === String(service.idUsuario));
  const relatedOffice = data ? officeFor({ nomeCategoria: service.nomeCategoria }) : null;
  useEffect(() => {
    setRelated([]);
    if (!relatedOffice) return;
    const controller = new AbortController();
    categoryServices(relatedOffice.id, { signal: controller.signal })
      .then((items) => setRelated(items.filter((item) => String(item.idServico) !== String(id)).slice(0, 3)))
      .catch(() => setRelated([]));
    return () => controller.abort();
  }, [relatedOffice?.id, id]);
  const proposal = Boolean(raw.valorCombinar || service.valorCombinar);
  const freelancerMedia =
    Number(
      raw.avaliacaoMediaFreelancer ??
        raw.avaliacao_media_freelancer ??
        service.avaliacaoMediaFreelancer ??
        0
    ) || 0;
  const freelancerTotal =
    Number(
      raw.totalAvaliacoesFreelancer ??
        raw.total_avaliacoes_freelancer ??
        service.totalAvaliacoesFreelancer ??
        0
    ) || 0;
  function needLogin(message) {
    notify('Login necessário', message, 'info');
    redirectTimer.current = setTimeout(() => navigate('/login'), 900);
  }
  function purchase() {
    if (!data) return;
    if (!user) return needLogin('Entre na sua conta para continuar.');
    if (owner)
      return notify('Este serviço é seu', 'Use o perfil para gerenciar o anúncio.', 'info');
    navigate(
      `/${proposal ? 'negociar-servico' : 'contratar-servico'}?id=${encodeURIComponent(service.idServico || id)}`
    );
  }
  async function favorite() {
    if (!data) return;
    if (!sessaoIniciada()) return needLogin('Entre para salvar favoritos.');
    const previous = saved;
    setSaving(true);
    try {
      await updateFavorite(service.idServico || id, previous);
      try {
        setSaved(await favoriteStatus(service.idServico || id));
      } catch {
        setSaved(false);
      }
      notify(
        previous ? 'Removido dos favoritos' : 'Serviço salvo',
        previous ? 'Removido com sucesso.' : 'Acesse pela página Favoritos.',
        previous ? 'info' : 'success'
      );
    } catch (err) {
      notify('Erro nos favoritos', err.message || 'Não foi possível atualizar.', 'info');
    } finally {
      setSaving(false);
    }
  }
  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(location.href);
      notify('Link copiado', 'Link copiado para a área de transferência.');
    } catch {
      notify('Não foi possível copiar', 'Copie pela barra do navegador.', 'info');
    }
  }
  const ownImage = service.imagemServico && !service.imagemServico.includes('servico_padrao');
  const office = officeFor({ nomeCategoria: category });
  const detailImage = ownImage ? service.imagemServico : office?.photo || defaultServiceImage;
  const shell = 'mx-auto w-full max-w-[1280px] px-10 legacy-max-720:px-6';
  const secondary =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-workly-rule bg-workly-card px-3 text-sm font-semibold text-workly-ink-warm transition-colors hover:border-workly-forest/40 disabled:opacity-60';
  return (
    <CatalogShell title={data ? `Workly - ${name}` : 'Workly - Detalhes do Serviço'}>
      <main aria-live="polite" className="bg-workly-paper">
        {error ? (
          <div className={`${shell} py-16`}>
            <ErrorState className="mx-auto grid max-w-[520px] justify-items-center gap-3 rounded-lg border border-workly-rule bg-workly-card p-10 text-center">
              <i aria-hidden="true" className="fas fa-circle-exclamation text-2xl text-workly-muted-warm" />
              <h1 className="text-[1.5rem] font-semibold text-workly-ink-warm">{error.title}</h1>
              <p className="leading-relaxed text-workly-muted-warm">{error.message}</p>
              <Link to="/todos-servicos" className={`${action} mt-2 w-auto bg-workly-forest px-6 text-workly-on-forest`}>
                Ver outros serviços
              </Link>
            </ErrorState>
          </div>
        ) : (
          <div className={`${shell} pt-8 pb-20 legacy-max-720:pt-5`}>
            <nav aria-label="Navegação" className="flex flex-wrap items-center gap-2 text-sm text-workly-muted-warm">
              <Link to="/todos-servicos" className="underline-offset-4 hover:underline">
                Serviços
              </Link>
              <i aria-hidden="true" className="fas fa-chevron-right text-[0.6rem]" />
              {office ? (
                <Link to={`/categorias?id=${office.id}`} className="underline-offset-4 hover:underline">
                  {category}
                </Link>
              ) : (
                <span>{category}</span>
              )}
            </nav>
            <div className="mt-5 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                <h1 className="max-w-[30ch] font-workly-display text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.025em] break-words text-balance text-workly-ink-warm [font-variation-settings:'opsz'_96]">
                  {name}
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.95rem] text-workly-muted-warm">
                  <span className="inline-flex items-center gap-2">
                    <img
                      src={service.fotoPerfil || defaultProfileImage}
                      alt=""
                      onError={(event) => fallbackImage(event, defaultProfileImage)}
                      className="h-7 w-7 rounded-full bg-workly-sunken object-cover"
                    />
                    {service.idUsuario ? (
                      <Link to={`/perfil-publico?id=${service.idUsuario}`} className="font-semibold text-workly-ink-warm underline-offset-4 hover:underline">
                        {seller}
                      </Link>
                    ) : (
                      <span className="font-semibold text-workly-ink-warm">{seller}</span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden="true" className="fas fa-star text-xs text-[#b7791f] dark:text-[#f2c14e]" />
                    {freelancerMedia && freelancerTotal
                      ? `${freelancerMedia.toFixed(1).replace('.', ',')} · ${freelancerTotal} ${freelancerTotal === 1 ? 'avaliação' : 'avaliações'}`
                      : 'Sem avaliações ainda'}
                  </span>
                  <span>Publicado em {data ? serviceDate(service, 'data não informada') : '--'}</span>
                </div>
                <figure className="mt-8">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-workly-forest-raised legacy-max-720:aspect-[4/3]">
                    <img
                      src={detailImage}
                      alt={ownImage ? `Imagem do serviço ${name}` : ''}
                      loading="eager"
                      onError={(event) => fallbackImage(event, defaultServiceImage)}
                      className={`h-full w-full object-cover ${ownImage ? '' : 'opacity-85 mix-blend-luminosity grayscale'}`}
                    />
                  </div>
                  {!ownImage && data && (
                    <figcaption className="mt-2 text-xs text-workly-muted-warm">
                      Imagem ilustrativa da categoria. O freelancer ainda não enviou uma imagem própria.
                    </figcaption>
                  )}
                </figure>
              </div>
              <aside
                aria-label="Contratação"
                className="self-start rounded-lg border border-workly-rule bg-workly-card p-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-1"
              >
                <p className="text-sm text-workly-muted-warm">{proposal ? 'Valor' : 'Valor do serviço'}</p>
                <p className="mt-1 font-workly-display text-[2.25rem] leading-none font-semibold text-workly-ink-warm tabular-nums [font-variation-settings:'opsz'_96]">
                  {proposal ? 'A combinar' : formatCurrency(raw.preco ?? service.preco ?? 0)}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-workly-muted-warm">
                  {proposal
                    ? 'Envie uma proposta para combinar escopo, prazo e valor.'
                    : 'Confirme o escopo antes de finalizar a contratação.'}
                </p>
                <Button
                  appearance="custom"
                  onClick={purchase}
                  className={`${action} mt-5 bg-workly-forest text-workly-on-forest hover:bg-workly-forest-raised dark:bg-workly-dark-accent dark:text-workly-night`}
                >
                  <i aria-hidden="true" className={`fas ${proposal ? 'fa-paper-plane' : 'fa-arrow-right'}`} />
                  {proposal ? 'Enviar proposta' : 'Continuar contratação'}
                </Button>
                <div className="mt-2.5 flex gap-2">
                  <Button appearance="custom" onClick={favorite} disabled={saving} aria-pressed={saved} className={secondary}>
                    <i aria-hidden="true" className={`${saved ? 'fas text-[#be123c] dark:text-[#fda4af]' : 'far'} fa-heart`} />
                    {saved ? 'Salvo' : 'Salvar'}
                  </Button>
                  <Button appearance="custom" onClick={copy} className={secondary}>
                    <i aria-hidden="true" className="fas fa-link" />
                    Copiar link
                  </Button>
                </div>
                {owner && (
                  <Link to={`/editar-servico?id=${service.idServico || id}`} className={`${secondary} mt-2 w-full`}>
                    <i aria-hidden="true" className="fas fa-pen" />
                    Editar serviço
                  </Link>
                )}
                <ul className="mt-6 grid gap-3 border-t border-workly-rule pt-5 text-sm leading-relaxed text-workly-muted-warm">
                  {[
                    ['fa-file-signature', 'O pedido é registrado na página de contratação e acompanhado em Contratos.'],
                    ['fa-comments', 'Combine prazo, escopo e revisões pelo chat do contrato antes do início.']
                  ].map(([icon, text]) => (
                    <li key={icon} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5">
                      <i aria-hidden="true" className={`fas ${icon} mt-1 text-xs text-workly-muted-warm`} />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </aside>
              <div className="grid min-w-0 content-start gap-10 lg:col-start-1 lg:row-start-2">
                <Description title="Sobre este serviço" kicker="Descrição">
                  {description}
                </Description>
                {(raw.extra || service.extra) && (
                  <Description title="Informações adicionais" kicker="Detalhes">
                    {raw.extra || service.extra}
                  </Description>
                )}
                <section className="border-t border-workly-rule pt-6">
                  <h2 className="text-[1.25rem] font-semibold text-workly-ink-warm">Sobre o freelancer</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <img
                      src={service.fotoPerfil || defaultProfileImage}
                      alt=""
                      onError={(event) => fallbackImage(event, defaultProfileImage)}
                      className="h-14 w-14 rounded-full bg-workly-sunken object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-workly-ink-warm">{seller}</p>
                      <p className="text-sm text-workly-muted-warm">{category}</p>
                    </div>
                    {service.idUsuario && (
                      <Link to={`/perfil-publico?id=${service.idUsuario}`} className={`${secondary} flex-none px-4`}>
                        Ver perfil
                      </Link>
                    )}
                  </div>
                </section>
              </div>
            </div>
            {related.length > 0 && (
              <section aria-labelledby="related-title" className="mt-20 border-t border-workly-rule pt-10">
                <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.08em] text-workly-primary-ink uppercase">Continue explorando</p>
                    <h2
                      id="related-title"
                      className="mt-2 font-workly-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight font-semibold tracking-[-0.02em] text-workly-ink-warm [font-variation-settings:'opsz'_48]"
                    >
                      Mais em {category}
                    </h2>
                  </div>
                  {relatedOffice && (
                    <Link
                      to={`/categorias?id=${relatedOffice.id}`}
                      className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-workly-primary-ink underline-offset-4 hover:underline"
                    >
                      Ver categoria <i aria-hidden="true" className="fas fa-arrow-right text-xs" />
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-x-6 gap-y-10">
                  {assignCovers(related).map((cover, index) => (
                    <ServiceCard key={related[index].idServico || index} service={related[index]} cover={cover} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
        {toast && (
          <div
            role="status"
            className="pointer-events-none fixed right-6 bottom-6 z-[12000] flex w-[min(360px,calc(100%-32px))] items-center gap-3.5 rounded-lg border border-workly-rule bg-workly-card px-4 py-3.5 text-workly-ink-warm shadow-[0_12px_32px_rgba(22,33,27,0.14)]"
          >
            <i
              aria-hidden="true"
              className={`fas ${toast.type === 'success' ? 'fa-check' : 'fa-info'} grid h-9 w-9 shrink-0 place-items-center rounded-full bg-workly-primary-tint text-workly-primary-ink`}
            />
            <div>
              <strong className="block text-[0.95rem] font-semibold">{toast.title}</strong>
              <span className="mt-0.5 block text-sm leading-snug text-workly-muted-warm">{toast.message}</span>
            </div>
          </div>
        )}
      </main>
    </CatalogShell>
  );
}
