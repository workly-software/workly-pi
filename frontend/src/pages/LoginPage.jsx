import { useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import AuthShell from '../components/auth/AuthShell';
import AuthField from '../components/auth/AuthField';
import { linkStyles, showAuthAlert, submitStyles } from '../components/auth/authPresentation';
import Button from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/Feedback';
import { login, iniciarSessao } from '../services/authService';
import logo from '../../assets/img/logo.png';
import RecoveryModal from '../components/auth/RecoveryModal';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const recoveryLink = useRef(null);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await login({ email: form.get('email').trim(), senha: form.get('senha') });
      iniciarSessao(result.user);
      await showAuthAlert({
        icon: 'success',
        title: 'Login realizado!',
        text: result.mensagem,
        confirmText: 'Continuar'
      });
      const destination = location.state?.from;
      navigate(
        typeof destination === 'string' &&
          destination.startsWith('/') &&
          !destination.startsWith('//') &&
          !/^\/(login|cadastro)(?:[/?#]|$)/.test(destination)
          ? destination
          : '/',
        { replace: true }
      );
    } catch (err) {
      const text = err.message || 'Não foi possível entrar na sua conta.';
      setError(text);
      await showAuthAlert({ icon: 'error', title: 'Erro no login', text, confirmText: 'Fechar' });
      setError('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell login>
      {() => (
        <div className="mx-auto grid w-[960px] max-w-full overflow-hidden rounded-2xl border border-workly-rule bg-workly-card md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] dark:border-white/10 dark:bg-workly-night-raised">
          <figure className="relative hidden min-h-[560px] md:block">
            <img
              src="/assets/img/oficios/fotografia.jpg"
              alt="Câmera fotográfica sobre a mesa de trabalho"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0c1411]/85 via-[#0c1411]/40 to-transparent px-8 pt-20 pb-8 text-[#f5f3ee]">
              <p className="font-workly-display text-[1.625rem] leading-[1.1] font-semibold tracking-[-0.02em] text-balance [font-variation-settings:'opsz'_96]">
                Profissionais de sete áreas criativas e técnicas.
              </p>
              <p className="mt-2 text-sm text-[#f5f3ee]/80">Design, programação, vídeo, IA, escrita, fotografia e áudio.</p>
            </figcaption>
          </figure>
          <form
            id="formLogin"
            onSubmit={submit}
            className="flex flex-col justify-center px-10 py-12 legacy-max-480:px-6 legacy-max-480:py-9"
            aria-busy={busy}
          >
            <Link to="/" aria-label="Workly, página inicial" className="mb-10 inline-flex w-fit">
              <img alt="Workly" src={logo} className="block w-[118px] dark:[filter:invert(1)_hue-rotate(180deg)]" />
            </Link>
            <h1 className="font-workly-display text-[2rem] leading-tight font-semibold tracking-[-0.025em] text-workly-ink-warm [font-variation-settings:'opsz'_96] dark:text-[#ecebe5]">
              Bem-vindo de volta
            </h1>
            <p className="mt-2 mb-8 text-workly-muted-warm dark:text-[#9aa59f]">
              Entre para acompanhar contratos, mensagens e serviços.
            </p>
            <AuthField
              id="email"
              name="email"
              label="E-mail*"
              placeholder="Digite seu e-mail"
              required
              icon="fa-user"
            />
            <AuthField
              id="senha"
              name="senha"
              label="Senha*"
              type="password"
              placeholder="Digite sua senha"
              required
              minLength={8}
            />
            <div className="mb-6 -mt-1 text-right">
              <a
                ref={recoveryLink}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setRecovery(true);
                }}
                className={`${linkStyles} text-sm leading-[normal]`}
              >
                Esqueceu a senha?
              </a>
            </div>
            <Button appearance="custom" type="submit" className={submitStyles}>
              Entrar
            </Button>
            {busy && <LoadingState inline message="Entrar" className="sr-only" />}
            {error && <ErrorState className="sr-only">{error}</ErrorState>}
            <p className="mt-6 border-t border-workly-rule pt-6 text-center text-sm leading-[normal] text-workly-muted-warm dark:border-white/10 dark:text-[#9aa59f]">
              Não tem uma conta?{' '}
              <Link to="/cadastro" className={`${linkStyles} font-semibold`}>
                Cadastre-se
              </Link>
            </p>
          </form>
          {recovery && <RecoveryModal opener={recoveryLink} onClose={() => setRecovery(false)} />}
        </div>
      )}
    </AuthShell>
  );
}
