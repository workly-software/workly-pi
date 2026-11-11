import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import ServiceCard from '../components/catalog/ServiceCard';
import ServiceFilters from '../components/catalog/ServiceFilters';
import Pagination from '../components/catalog/Pagination';
import { LoadingState, StatePanel } from '../components/ui/Feedback';
import Button from '../components/ui/Button';
import { assignCovers } from '../components/home/offices';
import {
  readServiceFilters,
  searchServicePage,
  serviceSearchParams,
  serviceSearchTitle
} from '../services/serviceSearchService';

export default function AllServicesPage() {
  const location = useLocation(),
    navigate = useNavigate();
  const original = useRef(new URLSearchParams(location.search));
  const [filters, setFilters] = useState(() => readServiceFilters(original.current));
  const [request, setRequest] = useState(filters),
    [services, setServices] = useState(null),
    [pagination, setPagination] = useState(null),
    [error, setError] = useState(false);
  const [title, setTitle] = useState(() => serviceSearchTitle(filters, original.current));
  const submittedSearch = useRef(location.search);
  useEffect(() => {
    if (location.search === submittedSearch.current) return;
    submittedSearch.current = location.search;
    original.current = new URLSearchParams(location.search);
    const next = readServiceFilters(original.current);
    setFilters(next);
    setRequest(next);
    setTitle(serviceSearchTitle(next, original.current));
  }, [location.search]);
  useEffect(() => {
    const controller = new AbortController();
    setServices(null);
    setPagination(null);
    setError(false);
    searchServicePage(request, { signal: controller.signal })
      .then(({ services, pagination }) => { setServices(services); setPagination(pagination); })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [request]);
  function apply(next, page = 1, replace = true) {
    next = { ...next, page };
    setFilters(next);
    original.current = serviceSearchParams(next);
    setTitle(serviceSearchTitle(next, original.current));
    setRequest({ ...next });
    submittedSearch.current = `?${serviceSearchParams(next)}`;
    navigate(`/todos-servicos${submittedSearch.current}`, { replace });
  }
  function submit(event) {
    event.preventDefault();
    apply(filters);
  }
  const covers = services ? assignCovers(services) : [];

  return (
    <CatalogShell title={title.title} footer={false} headerSearch={false} active={filters.categoria}>
      <header className="mx-auto max-w-[1280px] px-10 pt-12 pb-8 legacy-max-720:px-6 legacy-max-720:pt-8 legacy-max-720:pb-6">
        <h1
          id="category-title"
          className="max-w-[18ch] font-workly-display text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.02] font-semibold tracking-[-0.025em] break-words text-balance text-workly-ink-warm [font-variation-settings:'opsz'_96]"
        >
          {title.heading}
        </h1>
        <p className="mt-3 max-w-[52ch] text-lg text-workly-muted-warm">
          Encontre o profissional certo para dar vida à sua próxima ideia.
        </p>
      </header>
      <div className="sticky top-0 z-20 border-y border-workly-rule bg-workly-paper/95 backdrop-blur-[6px]">
        <div className="mx-auto max-w-[1280px] px-10 py-3 legacy-max-720:px-6">
          <ServiceFilters
            filters={filters}
            onChange={setFilters}
            onSubmit={submit}
            onApply={apply}
            count={services && !error ? pagination?.total ?? services.length : undefined}
          />
        </div>
      </div>
      <div className="mx-auto max-w-[1280px] px-10 pt-10 pb-20 legacy-max-720:px-6 legacy-max-720:pt-8">
        {error ? (
          <StatePanel
            error
            title="Não foi possível carregar"
            message="Tente novamente em alguns instantes."
            action={
              <Button variant="secondary" onClick={() => setRequest({ ...request })}>
                Tentar de novo
              </Button>
            }
          />
        ) : !services ? (
          <LoadingState message="Carregando serviços…" />
        ) : !services.length ? (
          <StatePanel
            icon="fa-search"
            title="Nenhum serviço encontrado"
            message="Remova algum filtro, tente outra palavra ou explore uma categoria acima."
            action={
              <Button variant="secondary" onClick={() => apply({ q: '', categoria: '', min: '', max: '', avaliacaoMin: '', ordenar: 'recentes' })}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service, index) => (
                <ServiceCard
                  key={service.idServico}
                  service={service}
                  cover={covers[index]}
                />
              ))}
            </div>
          </>
        )}
        {services && !error && <Pagination pagination={pagination} onPage={(page) => apply(request, page, false)} />}
      </div>
    </CatalogShell>
  );
}
