import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import FeaturedCard from '../components/home/FeaturedCard';
import CategoryNavigation from '../components/catalog/CategoryNavigation';
import { assignCovers, offices } from '../components/home/offices';

const heroPhotos = [
  '/assets/img/oficios/design.jpg',
  '/assets/img/oficios/video-2.jpg',
  '/assets/img/oficios/audio-3.jpg'
];
import { LoadingState, StatePanel } from '../components/ui/Feedback';
import Button from '../components/ui/Button';
import { featuredServices } from '../services/catalogService';

const container = 'mx-auto w-full max-w-[1280px] px-10 legacy-max-720:px-6';
const display =
  "font-workly-display font-semibold text-workly-ink-warm [font-variation-settings:'opsz'_96] dark:text-[#ecebe5]";
const muted = 'text-workly-muted-warm dark:text-[#9aa59f]';
const pageGround = 'bg-workly-paper dark:bg-workly-night';

const steps = [
  [
    'Encontre o serviço',
    'Busque por palavra-chave ou categoria e compare preços e avaliações.'
  ],
  [
    'Contrate ou negocie',
    'Contrate pelo valor anunciado ou envie uma proposta ao freelancer.'
  ],
  ['Acompanhe pelo contrato', 'Converse no chat do contrato e avalie o trabalho ao final.']
];

export default function HomePage() {
  const navigate = useNavigate(),
    [services, setServices] = useState(null),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    featuredServices({ signal: controller.signal })
      .then(setServices)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  function retry() {
    setError(false);
    setServices(null);
    setAttempt(attempt + 1);
  }
  function search(event) {
    event.preventDefault();
    const term = new FormData(event.currentTarget).get('q').trim();
    navigate(term ? `/todos-servicos?q=${encodeURIComponent(term)}` : '/todos-servicos');
  }
  return (
    <CatalogShell
      title="Workly - Encontre Freelancers"
      headerSearch={false}
      showCategories={false}
      headerTone="paper"
      background={pageGround}
      footerFlush
      footerTone="paper"
    >
      <main className={`${pageGround} text-workly-ink-warm dark:text-[#ecebe5]`}>
        <section className={`${container} grid grid-cols-12 items-center gap-x-6 gap-y-10 py-14 lg:py-16 legacy-max-480:py-10`}>
          <div className="col-span-12 lg:col-span-6">
            <h1
              className={`${display} text-[clamp(2.5rem,4.8vw,4.25rem)] leading-[1.02] tracking-[-0.025em] text-balance`}
            >
              Encontre os melhores freelancers para o seu projeto.
            </h1>
            <p className={`mt-5 max-w-[44ch] text-lg leading-relaxed text-pretty ${muted}`}>
              Profissionais de sete áreas prontos para trabalhar com você.
            </p>
            <form role="search" onSubmit={search} className="mt-9 max-w-[560px]">
              <label htmlFor="home-search" className={`text-sm font-medium ${muted}`}>
                Qual serviço você está procurando?
              </label>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-workly-rule bg-workly-card p-1.5 transition-[border-color,box-shadow] duration-200 ease-workly-out focus-within:border-workly-forest focus-within:shadow-[0_0_0_3px_rgba(14,59,44,0.14)] dark:focus-within:border-workly-dark-accent">
                <i aria-hidden="true" className="fas fa-search pl-3 text-workly-muted-warm" />
                <input
                  id="home-search"
                  name="q"
                  type="search"
                  enterKeyHint="search"
                  placeholder="Ex.: logotipo, site, vídeo"
                  className="h-12 w-full min-w-0 bg-transparent px-1 text-[1.0625rem] text-workly-ink-warm outline-none placeholder:text-workly-muted-warm focus-visible:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-workly-forest px-6 font-semibold text-workly-on-forest transition-[background-color,transform] duration-150 ease-workly-out hover:bg-workly-forest-raised motion-safe:active:scale-[0.97] dark:bg-workly-dark-accent dark:text-workly-night dark:hover:bg-[#6ee7a0]"
                >
                  Buscar
                </button>
              </div>
            </form>
          </div>
          <div aria-hidden="true" className="col-span-12 hidden grid-cols-5 grid-rows-2 gap-3 lg:col-span-6 lg:grid lg:h-[420px]">
            <img src={heroPhotos[0]} alt="" className="col-span-3 row-span-2 h-full w-full rounded-lg object-cover" />
            <img src={heroPhotos[1]} alt="" className="col-span-2 h-full w-full rounded-lg object-cover" />
            <img src={heroPhotos[2]} alt="" className="col-span-2 h-full w-full rounded-lg object-cover" />
          </div>
        </section>
        <div className="border-y border-workly-rule">
          <CategoryNavigation bordered={false} />
        </div>

        <section aria-labelledby="destaques" className={`${container} pt-20 legacy-max-480:pt-14`}>
          <div className="grid grid-cols-12 items-end gap-x-6 gap-y-3 border-t-2 border-workly-forest pt-6 dark:border-workly-dark-accent/60">
            <h2
              id="destaques"
              className={`${display} col-span-12 text-[clamp(2rem,3.4vw,2.75rem)] leading-[1.05] tracking-[-0.025em] md:col-span-7`}
            >
              Serviços em Destaque
            </h2>
            <div className="col-span-12 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 md:col-span-5 md:justify-end">
              <p className={`text-[0.95rem] ${muted}`}>Avaliação igual ou maior que 4,5.</p>
              <Link
                to="/todos-servicos"
                className="inline-flex min-h-11 items-center gap-2 font-semibold text-workly-forest underline-offset-4 hover:underline dark:text-workly-dark-accent"
              >
                Ver todos
                <i aria-hidden="true" className="fas fa-arrow-right text-sm" />
              </Link>
            </div>
          </div>
          <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {error ? (
              <StatePanel
                error
                title="Não foi possível carregar"
                message="Tente novamente em alguns instantes."
                action={
                  <Button variant="secondary" onClick={retry}>
                    <i aria-hidden="true" className="fas fa-redo text-sm" />
                    Tentar de novo
                  </Button>
                }
              />
            ) : !services ? (
              <LoadingState message="Buscando serviços bem avaliados…" className="col-span-full" />
            ) : !services.length ? (
              <StatePanel
                icon="fa-star"
                title="Sem destaques ainda"
                message="Os serviços com avaliação igual ou maior que 4,5 aparecerão aqui automaticamente."
                action={
                  <Button to="/todos-servicos" variant="secondary">
                    Ver todos os serviços
                  </Button>
                }
              />
            ) : (
              assignCovers(services).map((cover, index) => (
                <FeaturedCard
                  key={services[index].idServico || index}
                  service={services[index]}
                  categoryCover={cover}
                />
              ))
            )}
          </div>
        </section>

        <section aria-labelledby="como-funciona" className={`${container} pt-24 pb-24 legacy-max-480:py-16`}>
          <div className="grid grid-cols-12 gap-x-6 border-t-2 border-workly-forest pt-6 dark:border-workly-dark-accent/60">
            <h2
              id="como-funciona"
              className={`${display} col-span-12 text-[clamp(2rem,3.4vw,2.75rem)] leading-[1.05] tracking-[-0.025em] md:col-span-4`}
            >
              Como funciona
            </h2>
            <ol className="col-span-12 mt-8 grid gap-x-6 gap-y-10 md:col-span-8 md:mt-0 md:grid-cols-3">
              {steps.map(([title, text], index) => (
                <li key={title} className="border-l border-workly-rule pl-5 dark:border-white/15">
                  <span
                    aria-hidden="true"
                    className="block font-workly-display text-[3.5rem] leading-none font-medium text-workly-forest tabular-nums [font-variation-settings:'opsz'_96] dark:text-workly-dark-accent"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-workly-ink-warm dark:text-[#ecebe5]">
                    <span className="sr-only">Passo {index + 1}: </span>
                    {title}
                  </h3>
                  <p className={`mt-2 leading-relaxed text-pretty ${muted}`}>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="comecar" className="bg-workly-forest text-workly-on-forest dark:bg-[#0f2e22]">
          <div className={`${container} grid grid-cols-12 items-end gap-x-6 gap-y-8 py-20 legacy-max-480:py-14`}>
            <div className="col-span-12 md:col-span-7">
              <h2
                id="comecar"
                className="font-workly-display text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1] font-semibold tracking-[-0.03em] text-balance [font-variation-settings:'opsz'_96]"
              >
                Tem um projeto em mente?
              </h2>
              <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-workly-on-forest-muted">
                Explore os serviços por categoria ou anuncie o seu trabalho na Workly.
              </p>
            </div>
            <div className="col-span-12 flex flex-wrap gap-3 md:col-span-5 md:justify-end">
              <Link
                to="/todos-servicos"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#f5f3ee] px-6 font-semibold text-[#0e3b2c] transition-[background-color,transform] duration-150 ease-workly-out hover:bg-[#ffffff] motion-safe:active:scale-[0.97]"
              >
                Explorar serviços
              </Link>
              <Link
                to="/anuncio"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-workly-on-forest/40 px-6 font-semibold text-workly-on-forest transition-[border-color,background-color,transform] duration-150 ease-workly-out hover:border-workly-on-forest hover:bg-workly-card/5 motion-safe:active:scale-[0.97]"
              >
                Anunciar um serviço
              </Link>
            </div>
          </div>
        </section>
      </main>
    </CatalogShell>
  );
}
