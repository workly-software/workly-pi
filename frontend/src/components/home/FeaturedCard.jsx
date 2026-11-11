import { Link } from 'react-router';
import { defaultServiceImage, defaultProfileImage, formatCurrency } from '../../services/catalogService';
import { officeFor } from './offices';

export default function FeaturedCard({ service, categoryCover, footer, feature = false }) {
  const detail = `/detalhe-servico?id=${service.idServico}`;
  const office = officeFor(service);
  const ownImage =
    service.imagemServico && !service.imagemServico.includes(defaultServiceImage.split('/').pop());
  const cover = ownImage ? service.imagemServico : categoryCover || office?.photo || defaultServiceImage;
  const rated = service.totalAvaliacoesServico > 0 && service.avaliacaoMediaServico > 0;
  return (
    <article className={`group relative min-w-0 rounded-lg ${feature ? 'grid items-center gap-x-10 gap-y-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]' : 'flex flex-col'} outline-offset-4 has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-workly-primary-ink`}>
      <div
        className={`relative ${feature ? 'aspect-[16/10]' : 'aspect-[16/11]'} overflow-hidden rounded-xl ${ownImage ? 'bg-workly-sunken' : 'bg-workly-forest-raised'}`}
      >
        <img
          src={cover}
          alt=""
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover transition-transform duration-[400ms] ease-workly-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${ownImage ? '' : 'opacity-95'}`}
        />
        <span className="absolute bottom-3 left-3 rounded-md bg-workly-card/95 px-2 py-1 text-xs font-medium text-workly-ink-warm">
          {office?.label || service.nomeCategoria}
        </span>
      </div>
      <div className={`flex flex-1 flex-col ${feature ? '' : 'pt-4'}`}>
        <h3 className={`line-clamp-2 font-workly-display ${feature ? 'text-[clamp(1.75rem,2.6vw,2.25rem)] leading-[1.1]' : 'min-h-[2.6em] text-[1.25rem] leading-[1.3]'} font-semibold tracking-[-0.01em] text-workly-ink-warm [font-variation-settings:'opsz'_32]`}>
          <Link
            to={detail}
            className="card-link underline-offset-[5px] outline-none after:absolute after:inset-0 after:content-[''] group-hover:underline focus-visible:outline-none"
          >
            {service.nome}
          </Link>
        </h3>
        {feature && service.descricao && (
          <p className="mt-3 line-clamp-3 max-w-[52ch] leading-relaxed text-workly-muted-warm">{service.descricao}</p>
        )}
        <div className={`flex min-w-0 items-center gap-2 text-sm ${feature ? 'mt-6' : 'mt-3'}`}>
          <img
            src={service.fotoPerfil || defaultProfileImage}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              if (event.currentTarget.src !== new URL(defaultProfileImage, location.origin).href)
                event.currentTarget.src = defaultProfileImage;
            }}
            className="h-6 w-6 shrink-0 rounded-full bg-workly-sunken object-cover"
          />
          <Link
            to={`/perfil-publico?id=${service.idUsuario}`}
            className="relative z-[1] min-w-0 truncate font-medium text-workly-ink-warm underline-offset-4 hover:underline"
          >
            {service.nomeFreelancer}
          </Link>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-workly-muted-warm">
            {rated ? (
              <>
                <i aria-hidden="true" className="fas fa-star text-xs text-[#b7791f] dark:text-[#f2c14e]" />
                <span className="font-semibold text-workly-ink-warm tabular-nums">
                  {service.avaliacaoMediaServico.toFixed(1).replace('.', ',')}
                </span>
                <span className="tabular-nums">({service.totalAvaliacoesServico})</span>
              </>
            ) : (
              'Sem avaliações'
            )}
          </span>
        </div>
        <p className="mt-auto flex items-baseline gap-1.5 pt-4 text-workly-muted-warm">
          {service.valorCombinar ? (
            <span className="font-semibold text-workly-ink-warm">Valor a combinar</span>
          ) : (
            <span className="font-workly-display text-[1.25rem] font-semibold text-workly-ink-warm tabular-nums [font-variation-settings:'opsz'_32]">
                {formatCurrency(service.preco)}
              </span>
          )}
        </p>
        {footer}
      </div>
    </article>
  );
}
