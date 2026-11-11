import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import NotificationMenu from './NotificationMenu';
import Button from '../ui/Button';
import { sair } from '../../services/authService';
import { defaultProfileImage } from '../../services/catalogService';

export default function UserMenu({ user }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <div className="relative flex items-center gap-2.5 justify-self-end legacy-max-720:gap-2">
      <NotificationMenu />
      <div className="relative flex items-center" onClick={(event) => event.stopPropagation()}>
        <Button
          appearance="custom"
          id="profileBall"
          aria-label="Abrir menu do perfil"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex h-12 text-[13.3333px] items-center justify-center gap-2.5 border-0 text-workly-ink-warm focus-visible:outline-2 focus-visible:outline-workly-primary dark:text-[#ecebe5]"
        >
          <span className="max-w-[120px] truncate text-[0.96rem] leading-none font-semibold legacy-max-720:hidden!">
            {String(user.nome || '').split(' ')[0]}
          </span>
          <img
            src={user.fotoPerfil || defaultProfileImage}
            alt="Perfil"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = defaultProfileImage;
            }}
            className="h-[46px] w-[46px] min-w-[46px] rounded-full border-[3px] border-white bg-workly-forest object-cover shadow-[0_1px_2px_rgba(22,33,27,0.05)]"
          />
          <i
            aria-hidden="true"
            className={`fas fa-chevron-down text-[0.72rem] text-[#8a938d] transition-transform legacy-max-720:hidden! ${open ? 'rotate-180' : ''}`}
          />
        </Button>
        {open && (
          <div
            id="dropdownMenu"
            className="absolute top-[calc(100%+12px)] right-0 z-[2000] w-[220px] rounded-lg border border-[rgba(120,112,96,0.22)] bg-workly-card p-2.5 shadow-[0_1px_2px_rgba(22,33,27,0.05)] dark:border-[rgba(170,180,172,0.22)] dark:bg-[#0c1411] dark:shadow-none"
          >
            {[
              ['/perfil', 'fa-user', 'Perfil'],
              ['/favoritos', 'fa-heart', 'Favoritos'],
              ['/contratos', 'fa-briefcase', 'Contratos'],
              ['/mensagens', 'fa-comments', 'Mensagens'],
              ['/anuncio', 'fa-plus-circle', 'Anunciar serviço'],
              ['#', 'fa-sign-out-alt', 'Sair']
            ].map(([href, icon, text]) => (
              <Link
                key={text}
                id={text === 'Sair' ? 'logoutBtn' : undefined}
                to={href}
                onClick={
                  text === 'Sair'
                    ? async (event) => {
                        event.preventDefault();
                        await sair();
                        location.assign('/');
                      }
                    : () => setOpen(false)
                }
                className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.92rem] font-bold text-workly-ink-warm/80 hover:translate-x-0.5 hover:bg-workly-primary-glow/10 hover:text-workly-primary-ink dark:text-workly-dark-text dark:hover:bg-workly-dark-accent/[0.13] dark:hover:text-workly-dark-accent"
              >
                <i aria-hidden="true" className={`fas ${icon}`} />
                {text}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
