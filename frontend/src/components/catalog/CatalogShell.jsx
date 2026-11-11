import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import AuthShell from '../auth/AuthShell';
import AuthHeader from '../auth/AuthHeader';
import AuthFooter from '../auth/AuthFooter';
import { buscarUsuarioAtual, obterUsuario, sessaoIniciada } from '../../services/authService';
import UserMenu from './UserMenu';
import CategoryNavigation from './CategoryNavigation';

export default function CatalogShell({
  title,
  children,
  footer = true,
  showCategories = true,
  headerSearch = true,
  headerTone,
  background,
  footerFlush = false,
  footerTone,
  active: activeCategory
}) {
  const location = useLocation(),
    [user, setUser] = useState(() => (sessaoIniciada() ? obterUsuario() : null));
  const params = new URLSearchParams(location.search),
    active = activeCategory ?? (params.get('id') || params.get('id_categoria'));
  useEffect(() => {
    let mounted = true;
    buscarUsuarioAtual(false).then((value) => {
      if (mounted) setUser(value);
    });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const clear = () => setUser(null);
    window.addEventListener('workly:session-expired', clear);
    return () => window.removeEventListener('workly:session-expired', clear);
  }, []);
  return (
    <AuthShell title={title} floatingToggle={false} background={background}>
      {(dark, toggleTheme) => (
        <>
          <a
            href="#conteudo"
            className="sr-only z-[1100] rounded-lg bg-workly-primary-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Pular para o conteúdo
          </a>
          <AuthHeader
            dark={dark}
            activePath={location.pathname}
            showSearch={headerSearch}
            tone={headerTone}
            onToggleTheme={toggleTheme}
            rightSlot={user ? <UserMenu user={user} /> : undefined}
          >
            {showCategories && <CategoryNavigation active={active} />}
          </AuthHeader>
          <div id="conteudo" tabIndex={-1} className="outline-none">
            {children}
          </div>
          {footer === 'empty' ? (
            // Work surfaces close with a quiet rule instead of an empty footer band.
            <footer className="border-t border-workly-rule bg-workly-paper px-6 py-6 text-center text-sm text-workly-muted-warm dark:border-white/10 dark:bg-workly-night dark:text-[#9aa59f]">
              © {new Date().getFullYear()} Workly. Todos os direitos reservados.
            </footer>
          ) : (
            footer && (
              <AuthFooter
                catalog
                flush={footerFlush}
                tone={footerTone}
                detail={location.pathname === '/detalhe-servico'}
                about={location.pathname === '/sobre'}
                compact={['/anuncio', '/editar-servico'].includes(location.pathname)}
              />
            )
          )}
        </>
      )}
    </AuthShell>
  );
}
