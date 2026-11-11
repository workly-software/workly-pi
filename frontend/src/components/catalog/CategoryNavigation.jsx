import { Link } from 'react-router';
import { offices } from '../home/offices';

export default function CategoryNavigation({ active, bordered = true }) {
  return (
    <nav
      aria-label="Categorias"
      className={`w-full bg-workly-paper ${bordered ? 'border-b border-workly-rule' : ''}`}
    >
      <ul className="mx-auto flex max-w-[1280px] snap-x gap-1 overflow-x-auto px-10 py-2.5 [scrollbar-width:none] legacy-max-720:px-6 xl:justify-between">
        {offices.map((office) => {
          const current = active === office.id;
          return (
            <li key={office.id} className="shrink-0 snap-start">
              <Link
                to={`/categorias?id=${office.id}`}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-md py-1.5 pr-3 pl-1.5 text-[0.92rem] font-medium transition-colors ${current ? 'bg-workly-card text-workly-ink-warm shadow-[inset_0_-2px_0_var(--color-workly-forest)] dark:shadow-[inset_0_-2px_0_var(--color-workly-dark-accent)]' : 'text-workly-ink-warm/85 hover:bg-workly-card hover:text-workly-ink-warm'}`}
              >
                <img src={office.photo} alt="" loading="lazy" className="h-8 w-8 rounded object-cover" />
                {office.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
