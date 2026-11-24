import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import ServiceCard from '../components/catalog/ServiceCard';
import ServiceCardSkeleton from '../components/catalog/ServiceCardSkeleton';
import Pagination from '../components/catalog/Pagination';
import { StatePanel } from '../components/ui/Feedback';
import { buttonStyles } from '../components/ui/Button';
import { assignCovers } from '../components/home/offices';
import { categories, categoryServicePage } from '../services/catalogService';
import { servicePageNumber } from '../services/serviceSearchService';

export default function CategoryPage() {
  const [params, setParams] = useSearchParams(),
    id = params.get('id'),
    page = servicePageNumber(params.get('page'));
  const category = categories.find((item) => item.id === id);
  const [services, setServices] = useState(null),
    [pagination, setPagination] = useState(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setServices(null);
    setPagination(null);
    setError(false);
    categoryServicePage(id, page, { signal: controller.signal })
      .then(({ services, pagination }) => { setServices(services); setPagination(pagination); })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [id, page]);

  return (
    <CatalogShell title={category ? `Workly - ${category.label}` : 'Workly - Categoria'}>
      <section className="mx-auto max-w-[1280px] px-10 pt-8 pb-6 legacy-max-720:px-6 legacy-max-720:pt-6">
        <div className="min-w-0">
          <nav aria-label="Navegação" className="mb-5 flex items-center gap-2 text-sm text-workly-muted-warm">
            <Link to="/todos-servicos" className="underline-offset-4 hover:underline">
              Serviços
            </Link>
            <i aria-hidden="true" className="fas fa-chevron-right text-[0.6rem]" />
            <span className="text-workly-ink-warm">{category?.label || 'Categoria'}</span>
          </nav>
          <h1
            id="category-name"
            className="font-workly-display text-[clamp(2rem,3.6vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-workly-ink-warm [font-variation-settings:'opsz'_96]"
          >
            {category?.label || 'Categoria'}
          </h1>
          <p id="category-description" className="mt-4 max-w-[64ch] text-lg leading-relaxed text-workly-muted-warm">
            {category?.description || 'Escolha uma categoria para ver os serviços disponíveis.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
            {services && !error && (
              <span className="text-sm text-workly-muted-warm tabular-nums">
                {pagination?.total ?? services.length} {(pagination?.total ?? services.length) === 1 ? 'serviço disponível' : 'serviços disponíveis'}
              </span>
            )}
            <Link
              id="see-more-btn"
              to={category ? `/todos-servicos?id_categoria=${id}` : '/todos-servicos'}
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-workly-primary-ink underline-offset-4 hover:underline"
            >
              Filtrar por preço e avaliação
              <i aria-hidden="true" className="fas fa-arrow-right text-sm" />
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] border-t border-workly-rule px-10 pt-10 pb-20 legacy-max-720:px-6">
        <h2 className="sr-only">Serviços nesta categoria</h2>
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {error ? (
            <StatePanel
              error
              title="Não foi possível carregar os serviços"
              message="Tente novamente em instantes."
            />
          ) : !services ? (
            <ServiceCardSkeleton />
          ) : !services.length ? (
            <StatePanel
              icon="fa-briefcase"
              title="Nenhum serviço disponível"
              message="Ainda não há serviços cadastrados nesta categoria. Explore outras categorias ou anuncie o seu."
              action={
                <Link to="/anuncio" className={buttonStyles('primary')}>
                  Anunciar um serviço
                </Link>
              }
            />
          ) : (
            assignCovers(services).map((cover, index) => (
              <ServiceCard
                key={services[index].idServico || index}
                service={services[index]}
                cover={cover}
              />
            ))
          )}
        </div>
        {services && !error && <Pagination pagination={pagination} onPage={(nextPage) => {
          const next = new URLSearchParams(params);
          next.set('page', String(nextPage));
          setParams(next);
        }} />}
      </section>
    </CatalogShell>
  );
}
