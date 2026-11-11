import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '../ui/Feedback';
import { defaultProfileImage, formatCurrency } from '../../services/catalogService';
import { formatContractStatus, mergeDashboardWithFallback } from '../../services/profileDashboard';
import { panel, emptyPanel } from './ProfileHeader';
import { salesConfig, revenueConfig, viewsConfig } from './profileChartConfig';
import { buttonStyles } from '../ui/Button';

function themed(config, dark) {
  const ink = dark ? '#a3ada7' : '#5e6862';
  const grid = dark ? 'rgba(236,235,229,0.08)' : 'rgba(22,33,27,0.08)';
  const options = config.options || {};
  if (options.legend?.labels) options.legend.labels.fontColor = ink;
  for (const axis of [...(options.scales?.xAxes || []), ...(options.scales?.yAxes || [])]) {
    axis.ticks = { ...(axis.ticks || {}), fontColor: ink };
    axis.gridLines = { ...(axis.gridLines || {}), color: grid, zeroLineColor: grid };
  }
  return config;
}
const hasValues = (data) =>
  (data?.datasets || []).some((set) => (set.data || []).some((value) => Number(value) > 0));
function ChartEmpty({ icon, message }) {
  return (
    <div className="grid h-[220px] place-content-center justify-items-center gap-3 rounded-md border border-dashed border-workly-rule bg-workly-paper px-6 text-center">
      <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-workly-primary-tint text-workly-primary-ink">
        <i className={`fas ${icon}`} />
      </span>
      <p className="max-w-[34ch] text-sm leading-relaxed text-workly-muted-warm">{message}</p>
    </div>
  );
}

let chartPromise;
function chartLibrary() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartPromise)
    chartPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/chart/Chart.min.js';
      script.onload = () => resolve(window.Chart);
      script.onerror = () => {
        chartPromise = null;
        script.remove();
        reject(new Error('Não foi possível carregar os gráficos.'));
      };
      document.head.appendChild(script);
    });
  return chartPromise;
}
function Chart({ id, config, data }) {
  const ref = useRef(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      chart;
    chartLibrary()
      .then((Library) => {
        if (active) {
          chart = new Library(
            ref.current.getContext('2d'),
            themed(config(), Boolean(ref.current.closest('[data-workly-theme="dark"]')))
          );
          chart.data = data;
          chart.update();
        }
      })
      .catch((value) => {
        if (active) setError(value.message);
      });
    return () => {
      active = false;
      chart?.destroy();
    };
  }, [config, data]);
  return (
    <div className="relative h-[260px] w-full min-w-0">
      <canvas id={id} ref={ref} className="max-w-full" />
      {error && <ErrorState>{error}</ErrorState>}
    </div>
  );
}
function activityDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Agora';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return minutes + ' min atrás';
  if (minutes < 1440) return Math.floor(minutes / 60) + ' h atrás';
  if (minutes < 11520) return Math.floor(minutes / 1440) + ' d atrás';
  return new Date(value).toLocaleDateString('pt-BR');
}
export default function ProfileDashboard({ data }) {
  const dashboard = mergeDashboardWithFallback(
    data.dashboard,
    data.services,
    data.reviews,
    data.leads,
    data.user
  );
  const monthly = dashboard.monthlyPerformance || {},
    distribution = dashboard.revenueDistribution || {},
    weekly = dashboard.weeklyActivity || {},
    summary = dashboard.summary || {};
  const title = 'mb-4 flex flex-wrap items-center justify-between gap-3 text-[1.05rem] font-semibold text-workly-ink-warm';
  const revenue =
    summary.valorTotal ||
    (monthly.primaryData || []).reduce((sum, value) => sum + Number(value || 0), 0);
  const stats = [
    [formatCurrency(revenue), 'Receita concluída', 'Vendas concluídas como freelancer'],
    [formatCurrency(summary.gastosTotal || 0), 'Gastos concluídos', 'Compras concluídas como cliente'],
    [
      data.reviewSummary.total
        ? Number(data.reviewSummary.mediaFreelancer || 0)
            .toFixed(1)
            .replace('.', ',') +
          ' (' +
          data.reviewSummary.total +
          ')'
        : '--',
      'Avaliação',
      data.reviewSummary.total ? 'Média das avaliações recebidas' : 'Ainda sem avaliações'
    ],
    [summary.contratos || 0, 'Contratos', `${summary.propostas || 0} propostas`]
  ];
  const labels = monthly.labels || [],
    last = Math.max(0, labels.length - 1);
  const months = {
    jan: 'Janeiro',
    fev: 'Fevereiro',
    mar: 'Março',
    abr: 'Abril',
    mai: 'Maio',
    jun: 'Junho',
    jul: 'Julho',
    ago: 'Agosto',
    set: 'Setembro',
    out: 'Outubro',
    nov: 'Novembro',
    dez: 'Dezembro'
  };
  const month =
    months[
      String(labels[last] || '')
        .toLowerCase()
        .replace('.', '')
    ] ||
    labels[last] ||
    'mês atual';
  const salesData = {
    labels,
    datasets: [      {
        label: monthly.expenseLabel || 'Gastos com serviços concluídos (R$)',
        data: monthly.expenseData || [],
        borderColor: '#b7791f',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 3,
        fill: false,
        yAxisID: 'y-axis-money'
      },
      {
        label:
          monthly.primaryLabel ||
          (data.user.tipoConta === 'Contratante' ? 'Gastos (R$)' : 'Receita (R$)'),
        data: monthly.primaryData || [],
        backgroundColor: 'rgba(4, 191, 85, 0.12)',
        borderColor: '#04BF55',
        borderWidth: 3,
        pointBackgroundColor: '#04BF55',
        pointRadius: 4,
        fill: true,
        lineTension: 0.3,
        yAxisID: 'y-axis-money'
      },
      {
        label: monthly.secondaryLabel || 'Ações',
        data: monthly.secondaryData || [],
        backgroundColor: 'rgba(4,191,85, 0.10)',
        borderColor: '#037a3a',
        borderWidth: 2,
        pointBackgroundColor: '#037a3a',
        pointRadius: 3,
        fill: false,
        lineTension: 0.3,
        yAxisID: 'y-axis-count'
      }
    ]
  };
  const revenueData = {
    labels: distribution.labels || ['Sem receita ainda'],
    datasets: [
      {
        label: distribution.title || 'Distribuição',
        data: distribution.data || [0],
        backgroundColor: distribution.empty
          ? ['rgba(120,112,96, 0.35)']
          : ['#04BF55', '#037a3a', '#F59E0B', '#8B5CF6', '#EF4444'],
        borderColor: '#ffffff',
        borderWidth: 2
      }
    ]
  };
  return (
    <div className="mb-10 grid gap-5 lg:grid-cols-3">
      <section className={`${panel} p-5 lg:col-span-3`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-[1.05rem] font-semibold text-workly-ink-warm">Visão geral</h3>
        <div className="flex flex-wrap gap-2.5">
          <Link to="/contratos" className={buttonStyles('secondary', 'md', 'rounded-md')}>
            <i className="fas fa-briefcase" aria-hidden="true" /> Ver contratos
          </Link>
          <Link to="/anuncio" className={buttonStyles('primary', 'md', 'rounded-md')}>
            <i className="fas fa-plus" aria-hidden="true" /> Novo serviço
          </Link>
        </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-y-6 border-t border-workly-rule pt-5 md:grid-cols-4">
          {stats.map(([value, label, hint]) => (
            <div
              key={label}
              className="min-w-0 border-workly-rule px-5 first:pl-0 md:border-l md:first:border-l-0 [&:nth-child(3)]:pl-0 md:[&:nth-child(3)]:pl-5 [&:nth-child(even)]:border-l md:[&:nth-child(even)]:border-l"
            >
              <dt className="text-xs font-medium tracking-[0.04em] text-workly-muted-warm uppercase">{label}</dt>
              <dd className="mt-1.5 font-workly-display text-[clamp(1.375rem,2.2vw,1.75rem)] leading-none font-semibold break-words text-workly-ink-warm tabular-nums [font-variation-settings:'opsz'_32]">
                {value}
              </dd>
              <dd className="mt-1.5 text-[0.8rem] text-workly-muted-warm">{hint}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={`${panel} flex flex-col p-5 lg:col-span-2`}>
        <h3 className={title}>Desempenho mensal</h3>
        {hasValues(salesData) ? (
          <Chart id="salesChart" config={salesConfig} data={salesData} />
        ) : (
          <ChartEmpty icon="fa-chart-line" message="O desempenho mensal aparece aqui depois dos primeiros contratos." />
        )}
        <div aria-hidden="true" className="min-h-5 flex-1" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-workly-rule pt-4 md:grid-cols-4">
          {[
            [monthly.secondaryData?.[last] || 0, `Atividades em ${month.toLowerCase()}`],
            [summary.servicosPublicados || data.services.length, 'Serviços publicados'],
            [summary.propostas || 0, 'Propostas'],
            [summary.contratos || 0, 'Contratos']
          ].map(([value, label]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-workly-muted-warm">{label}</dt>
              <dd className="mt-0.5 font-semibold break-words text-workly-ink-warm tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        className={`${panel} cursor-pointer self-stretch p-5 transition-colors hover:border-workly-forest/30 focus-visible:outline-2 focus-visible:outline-workly-primary`}
        role="button"
        tabIndex={0}
        aria-label="Abrir página de contratos"
        onClick={() => location.assign('/contratos')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            location.assign('/contratos');
          }
        }}
      >
        <h3 className={`${title} flex flex-wrap justify-between gap-3`}>
          Leads{' '}
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-workly-primary-ink">
            Ver contratos <i className="fas fa-arrow-right text-xs" aria-hidden="true" />
          </span>
        </h3>
        {data.leads.length ? (
          data.leads.slice(0, 2).map((lead, index) => (
            <article
              key={lead.idContrato || index}
              className="flex min-w-0 gap-3 border-b border-workly-rule py-[14px] last:border-b-0 last:pb-0 dark:border-white/8"
            >
              <img
                src={lead.cliente?.fotoPerfil || defaultProfileImage}
                alt="Foto do cliente"
                className="h-10 w-10 shrink-0 rounded-full bg-workly-sunken object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-[3px] flex items-center justify-between gap-2.5">
                  <h4 className="font-semibold">{lead.cliente?.nome || 'Cliente'}</h4>
                  <span className="shrink-0 rounded-full bg-workly-primary/12 px-2.5 py-[5px] text-[0.8rem] font-semibold text-workly-primary-ink">
                    {formatContractStatus(lead.status)}
                  </span>
                </div>
                <p className="mb-1.5 text-[0.86rem] font-medium text-workly-ink-warm/80">
                  {lead.tipoContratacao === 'fixo' ? 'Contratação direta' : 'Proposta recebida'} ·{' '}
                  {lead.nomeServico || lead.nome_servico || 'Serviço'}
                </p>
                <p className="mt-1 mb-2.5 text-[0.84rem] leading-[1.45] text-workly-muted-warm dark:text-[#9aa59f]">
                  {lead.mensagem || 'Sem mensagem enviada.'}
                </p>
                <div className="flex flex-wrap gap-2 text-[0.78rem] text-workly-muted-warm [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:tabular-nums">
                  <span>
                    <i className="fas fa-money-bill-wave" aria-hidden="true" />{' '}
                    {lead.tipoContratacao === 'combinar' && !lead.preco && !lead.precoProposto
                      ? 'Valor a combinar'
                      : lead.precoProposto || lead.preco_proposto || lead.preco
                        ? formatCurrency(lead.precoProposto || lead.preco_proposto || lead.preco)
                        : 'Sem valor definido'}
                  </span>
                  <span>
                    <i className="fas fa-calendar" aria-hidden="true" />{' '}
                    {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('pt-BR') : 'Hoje'}
                  </span>
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyState className={emptyPanel}>
            <h4>Nenhum lead ainda</h4>
            <p>As propostas recebidas aparecerão aqui automaticamente.</p>
          </EmptyState>
        )}
      </section>
      <section className={`${panel} p-5`}>
        <h3 className={title}>Receita por serviço concluído</h3>
        {!distribution.empty && hasValues(revenueData) ? (
          <Chart id="revenueChart" config={revenueConfig} data={revenueData} />
        ) : (
          <ChartEmpty icon="fa-chart-pie" message="A receita aparece após a conclusão de um serviço vendido por você. Compras não entram neste gráfico." />
        )}
        <div className="mt-4 grid gap-2.5">
          {(distribution.empty ? ['Nenhum serviço vendido e concluído'] : distribution.labels || []).map(
            (label, index) => (
              <div
                key={index}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-workly-rule pt-2.5 text-sm"
              >
                <span className="truncate text-workly-muted-warm">{label}</span>
                <strong className="font-semibold text-workly-ink-warm tabular-nums">
                  {formatCurrency(distribution.empty ? 0 : distribution.data[index] || 0)}
                </strong>
              </div>
            )
          )}
        </div>
      </section>
      <section className={`${panel} p-5`}>
        <h3 className={title}>Atividades recentes</h3>
        {dashboard.recentActivities?.length ? (
          dashboard.recentActivities.slice(0, 3).map((activity, index) => (
            <article
              key={index}
              className="flex min-w-0 items-start gap-3 border-b border-workly-rule py-[14px] first:pt-0 last:border-b-0 last:pb-0 dark:border-white/8"
            >
              <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-workly-primary-tint text-sm leading-none text-workly-primary-ink">
                <i className={`fas ${activity.icon || 'fa-bell'}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">{activity.titulo || 'Atividade'}</p>
                  {activity.status && (
                    <span className="shrink-0 rounded-full bg-workly-primary/12 px-[9px] py-[5px] text-[0.78rem] font-semibold text-workly-primary-ink">
                      {activity.status}
                    </span>
                  )}
                </div>
                {activity.descricao && (
                  <p className="text-sm text-workly-muted-warm dark:text-[#9aa59f]">{activity.descricao}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-[0.8rem] text-workly-muted-warm">
                  <span>{activityDate(activity.date)}</span>
                  {Number(activity.valor) > 0 && (
                    <strong className="font-semibold text-workly-ink-warm/80 tabular-nums before:mr-2 before:content-['·']">
                      {formatCurrency(activity.valor)}
                    </strong>
                  )}
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyState className={emptyPanel}>
            <h4>Nenhuma atividade recente</h4>
            <p>
              Contratos, avaliações, favoritos e serviços publicados aparecerão aqui
              automaticamente.
            </p>
          </EmptyState>
        )}
      </section>
      <section className={`${panel} p-5`}>
        <h3 className={title}>Atividade da semana</h3>
        {hasValues({ datasets: [{ data: weekly.data || [] }] }) ? (
        <Chart
          id="viewsChart"
          config={viewsConfig}
          data={{
            labels: weekly.labels || ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
            datasets: [
              {
                label: 'Atividades',
                data: weekly.data || [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: '#04BF55'
              }
            ]
          }}
        />
        ) : (
          <ChartEmpty icon="fa-calendar-week" message="Sem atividades registradas nesta semana." />
        )}
      </section>
    </div>
  );
}
