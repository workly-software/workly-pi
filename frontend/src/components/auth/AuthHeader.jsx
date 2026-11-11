import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { buttonStyles } from '../ui/Button';
import logo from '../../../assets/img/logo.png';

const navLinks = [
  ['/', 'Home'],
  ['/sobre', 'Sobre Nós']
];
const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-workly-ink-warm/80 transition-[background-color,color,transform] duration-150 ease-workly-out hover:bg-workly-primary-tint hover:text-workly-primary-ink motion-safe:active:scale-[0.95] dark:text-[#d6d1c4] dark:hover:bg-workly-dark-accent/10 dark:hover:text-workly-dark-accent';

export default function AuthHeader({
  dark,
  rightSlot,
  children,
  activePath,
  showSearch = true,
  onToggleTheme,
  tone = 'paper'
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const menuPanel = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    function onClick(event) {
      if (!menuPanel.current?.contains(event.target) && !menuButton.current?.contains(event.target))
        setMenuOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [menuOpen]);
  const menuLink = (path) =>
    `relative py-2.5 leading-none transition-colors after:absolute after:bottom-0.5 after:left-0 after:h-[3px] after:w-full after:origin-left after:rounded-full after:bg-workly-forest after:transition-transform after:duration-200 after:ease-workly-out after:content-[''] hover:text-workly-primary-ink hover:after:scale-x-100 dark:hover:text-workly-dark-accent ${activePath === path ? 'text-workly-primary-ink after:scale-x-100 dark:text-workly-dark-accent' : 'after:scale-x-0'}`;
  function search(event) {
    event.preventDefault();
    const term = new FormData(event.currentTarget).get('search').trim();
    navigate(term ? `/todos-servicos?q=${encodeURIComponent(term)}` : '/todos-servicos');
  }
  return (
    <header className="relative z-[1000] w-full">
      <nav
        aria-label="Workly"
        className={
          tone === 'paper'
            ? 'border-b border-workly-rule bg-workly-paper dark:border-white/10 dark:bg-workly-night'
            : 'border-b border-[rgba(22,33,27,0.08)] bg-workly-card/96 shadow-[0_1px_2px_rgba(22,33,27,0.05)] dark:border-[rgba(170,180,172,0.18)] dark:bg-[rgba(12,20,17,0.98)] dark:shadow-none'
        }
      >
        <div className="relative mx-auto flex min-h-[76px] w-full max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-3 px-10 py-3 legacy-max-1100:gap-x-[18px] legacy-max-720:min-h-0 legacy-max-720:gap-x-2 legacy-max-720:px-6">
          <Link to="/" aria-label="Workly - página inicial" className="flex h-11 shrink-0 items-center">
            <img
              alt="Workly"
              src={logo}
              className={`block h-11 w-auto max-w-[150px] object-contain legacy-max-720:h-[38px] legacy-max-720:max-w-[132px] dark:[filter:invert(1)_hue-rotate(180deg)]`}
            />
          </Link>
          {showSearch && (
            <form
              role="search"
              onSubmit={search}
              className="relative flex h-[46px] min-w-[240px] flex-1 basis-[280px] items-center min-[1101px]:max-w-[560px] legacy-max-720:order-last legacy-max-720:basis-full"
            >
              <input
                name="search"
                type="search"
                aria-label="O que você está buscando?"
                placeholder="O que você está buscando?"
                className="h-[46px] w-full rounded-full border border-[rgba(120,112,96,0.45)] bg-workly-card pr-12 pl-5 text-[0.95rem] leading-[normal] font-medium text-workly-ink-warm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-workly-muted-warm focus:border-workly-primary-ink focus:shadow-[0_0_0_4px_rgba(3,122,58,0.14)] focus-visible:outline-none dark:border-[rgba(170,180,172,0.26)] dark:bg-[#0c1411] dark:text-workly-dark-text dark:placeholder:text-[#9aa59f] dark:focus:border-workly-dark-accent dark:focus:shadow-[0_0_0_4px_rgba(74,222,128,0.14)]"
              />
              <button
                type="submit"
                aria-label="Buscar"
                className="absolute top-px right-0.5 flex h-11 w-11 items-center justify-center rounded-full text-workly-ink-warm/80 transition-colors hover:bg-workly-primary-tint hover:text-workly-primary-ink dark:text-[#d6d1c4] dark:hover:bg-workly-dark-accent/10 dark:hover:text-workly-dark-accent"
              >
                <i aria-hidden="true" className="fas fa-search" />
              </button>
            </form>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="mr-5 flex items-center gap-[30px] text-[0.95rem] font-bold text-workly-ink-warm legacy-max-1100:hidden dark:text-workly-dark-text">
              {navLinks.map(([path, label]) => (
                <Link
                  key={path}
                  to={path}
                  aria-current={activePath === path ? 'page' : undefined}
                  className={menuLink(path)}
                >
                  {label}
                </Link>
              ))}
            </div>
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
                title={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
                className={iconButton}
              >
                <i aria-hidden="true" className={`fas ${dark ? 'fa-sun' : 'fa-moon'}`} />
              </button>
            )}
            {rightSlot || (
              <Link
                to="/login"
                className={
                  tone === 'paper'
                    ? `${buttonStyles('forest', 'md', 'rounded-md')} legacy-max-720:px-4`
                    : `${buttonStyles('primary', 'md', 'rounded-full')} legacy-max-720:px-4`
                }
              >
                Entrar
              </Link>
            )}
            <button
              ref={menuButton}
              type="button"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="workly-mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
              className={`${iconButton} min-[1101px]:hidden`}
            >
              <i aria-hidden="true" className={`fas ${menuOpen ? 'fa-times' : 'fa-bars'}`} />
            </button>
          </div>
          <div
            ref={menuPanel}
            id="workly-mobile-menu"
            className={`absolute top-[calc(100%+8px)] right-6 z-[1001] w-[min(260px,calc(100vw-32px))] origin-top-right rounded-xl border border-workly-border bg-workly-card p-2 shadow-[0_1px_2px_rgba(22,33,27,0.05)] transition-[opacity,transform,visibility] duration-200 ease-workly-out min-[1101px]:hidden motion-reduce:transition-opacity dark:border-workly-dark-border dark:bg-[#0c1411] ${menuOpen ? 'visible scale-100 opacity-100' : 'invisible scale-[0.97] opacity-0'}`}
          >
            <ul className="grid gap-1">
              {[...navLinks, ['/todos-servicos', 'Todos os serviços']].map(([path, label]) => (
                <li key={path}>
                  <Link
                    to={path}
                    onClick={() => setMenuOpen(false)}
                    aria-current={activePath === path ? 'page' : undefined}
                    className={`flex min-h-11 items-center rounded-lg px-3 font-semibold transition-colors hover:bg-workly-primary-tint hover:text-workly-primary-ink dark:hover:bg-workly-dark-accent/10 dark:hover:text-workly-dark-accent ${activePath === path ? 'text-workly-primary-ink dark:text-workly-dark-accent' : 'text-workly-text dark:text-workly-dark-text'}`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>
      {children}
    </header>
  );
}
