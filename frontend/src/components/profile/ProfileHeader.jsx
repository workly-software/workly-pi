import { categoryLabel, defaultProfileImage } from '../../services/catalogService';

export const panel = 'min-w-0 rounded-lg border border-workly-rule bg-workly-card text-workly-ink-warm';
export const emptyPanel =
  'rounded-lg border border-dashed border-workly-rule bg-workly-paper p-6 text-center text-workly-muted-warm';
export function Stars({ value, round = false }) {
  const rating = round ? Math.round(Number(value || 0)) : Number(value || 0);
  return (
    <span className="inline-flex gap-1 text-[#b7791f] dark:text-[#f2c14e]" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} aria-hidden="true" className={`${rating >= i + 1 ? 'fas' : 'far'} fa-star`} />
      ))}
    </span>
  );
}
export default function ProfileHeader({
  user,
  services = [],
  summary = {},
  publicProfile = false,
  onPhoto
}) {
  const contractor =
    String(user.tipoConta || '')
      .toLowerCase()
      .includes('contratante') && !services.length;
  const created = user.createdAt && new Date(user.createdAt);
  const since =
    created && !Number.isNaN(created.getTime())
      ? created.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
      : '--';
  const area = user.areaAtuacao ? categoryLabel(user.areaAtuacao) : '--';
  const stats = publicProfile
    ? [
        [services.length, 'Serviços'],
        [
          summary.total
            ? Number(summary.mediaFreelancer || 0)
                .toFixed(1)
                .replace('.', ',')
            : '--',
          summary.total ? `Avaliação · ${summary.total}` : 'Avaliação'
        ],
        [user.tipoConta || '--', 'Conta']
      ]
    : [
        [user.tipoConta || '--', 'Conta'],
        [area, 'Área'],
        [since, 'Membro desde']
      ];
  const role = `${user.tipoConta || 'Usuário'}${user.areaAtuacao ? ' · ' + categoryLabel(user.areaAtuacao) : ''}`;
  return (
    <section className="mb-6 grid items-center gap-x-10 gap-y-6 pt-2 pb-4 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(220px,260px)]">
      <div className="relative h-[128px] w-[128px] shrink-0 legacy-max-720:h-24 legacy-max-720:w-24">
        <img
          id={publicProfile ? 'publicAvatar' : undefined}
          className="h-full w-full rounded-full border-4 border-workly-paper bg-workly-sunken object-cover shadow-[0_0_0_1px_var(--color-workly-rule)]"
          src={user.fotoPerfil || defaultProfileImage}
          alt="Foto de perfil"
        />
        {onPhoto && (
          <button
            type="button"
            aria-label="Alterar foto de perfil"
            onClick={onPhoto}
            className="absolute -right-0.5 bottom-0.5 grid h-10 w-10 place-items-center rounded-full border-[3px] border-workly-paper bg-workly-forest text-sm leading-none text-workly-on-forest transition-[background-color,transform] duration-150 hover:bg-workly-forest-raised motion-safe:active:scale-95 dark:bg-workly-dark-accent dark:text-workly-night"
          >
            <i className="fas fa-camera" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-workly-primary-ink uppercase">
          {publicProfile ? 'Perfil profissional' : 'Seu perfil'}
        </p>
        <h1
          id={publicProfile ? 'publicName' : undefined}
          className="font-workly-display text-[clamp(2rem,3.6vw,2.75rem)] leading-[1.02] font-semibold tracking-[-0.025em] break-words text-workly-ink-warm [font-variation-settings:'opsz'_96]"
        >
          {user.nome || 'Usuário Workly'}
        </h1>
        <p className="mt-2 font-medium text-workly-ink-warm/80">{user.tituloProfissional || role}</p>
        <p className="mt-3 max-w-[62ch] leading-relaxed text-workly-muted-warm">
          {user.bio ||
            (publicProfile
              ? contractor
                ? 'Contratante da plataforma Workly.'
                : 'Este usuário ainda não adicionou uma biografia.'
              : 'Adicione uma biografia nas configurações para contar sobre seus serviços e experiência.')}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 border-t border-workly-rule pt-5 md:col-span-2 lg:col-span-1 lg:grid-cols-1 lg:gap-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8 legacy-max-520:grid-cols-1 legacy-max-520:gap-3">
        {stats.map(([value, label]) => (
          <div
            key={label}
            className="flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-4 lg:border-b lg:border-workly-rule lg:py-3 lg:last:border-b-0 legacy-max-520:flex-row legacy-max-520:items-baseline legacy-max-520:justify-between"
          >
            <dt className="text-xs font-medium tracking-[0.04em] text-workly-muted-warm uppercase">{label}</dt>
            <dd className="font-workly-display text-[1.125rem] font-semibold break-words text-workly-ink-warm tabular-nums first-letter:uppercase lg:text-right [font-variation-settings:'opsz'_32]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
