import { useEffect, useState } from 'react';
import Button from '../ui/Button';

const defaultBackground = 'bg-workly-paper dark:bg-workly-night';

export default function AuthShell({
  children,
  login = false,
  title,
  floatingToggle = true,
  background = defaultBackground
}) {
  const [dark, setDark] = useState(() => localStorage.getItem('darkMode') === 'enabled');
  useEffect(() => {
    document.title = title || (login ? 'Workly - Login' : 'Workly - Cadastro');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    return () => {
      document.documentElement.style.colorScheme = '';
    };
  }, [dark, login, title]);
  function toggleTheme() {
    localStorage.setItem('darkMode', dark ? 'disabled' : 'enabled');
    setDark(!dark);
  }
  return (
    <div
      data-workly-theme={dark ? 'dark' : 'light'}
      className={`min-h-screen ${background} font-workly leading-[normal] tracking-[0] text-workly-text dark:text-workly-dark-text ${login ? 'flex items-center justify-center p-6' : ''}`}
    >
      {typeof children === 'function' ? children(dark, toggleTheme) : children}
      {floatingToggle && (
        <Button
          appearance="custom"
          title={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
          aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
          onClick={toggleTheme}
          className="fixed right-[22px] bottom-[22px] z-[9999] inline-flex h-[54px] w-[54px] items-center justify-center rounded-full border border-[rgba(22,33,27,0.08)] bg-workly-card text-workly-ink-warm shadow-[0_1px_2px_rgba(22,33,27,0.05)]  transition-transform duration-150 ease-workly-out hover:-translate-y-[3px] motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-workly-primary legacy-max-768:right-[14px] legacy-max-768:bottom-[14px] legacy-max-768:h-12 legacy-max-768:w-12 dark:border-white/10 dark:bg-workly-forest dark:text-workly-dark-text dark:shadow-none"
        >
          <i aria-hidden="true" className={`fas ${dark ? 'fa-sun' : 'fa-moon'} text-[1.1rem]`} />
        </Button>
      )}
    </div>
  );
}
