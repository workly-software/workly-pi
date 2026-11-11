import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import AuthShell from '../components/auth/AuthShell';
import AuthField from '../components/auth/AuthField';
import { linkStyles, submitStyles } from '../components/auth/authPresentation';
import Button from '../components/ui/Button';
import { LoadingState } from '../components/ui/Feedback';
import {
  clearResetToken,
  newPasswordProblem,
  resetPassword,
  takeResetToken
} from '../services/authService';
import logo from '../../assets/img/logo.png';

const notice = 'mb-6 rounded-md px-3.5 py-3 text-sm leading-relaxed';
const warning = 'bg-[#fdf3e2] text-[#8a5000] dark:bg-[#f2c14e]/15 dark:text-[#f2c14e]';

export default function ResetPasswordPage() {
  const [token] = useState(() => takeResetToken());
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
      clearResetToken();
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const novaSenha = form.get('novaSenha');
    const confirmarSenha = form.get('confirmarSenha');
    const problem = newPasswordProblem(novaSenha, confirmarSenha);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      const response = await resetPassword({ token, novaSenha, confirmarSenha });
      setDone(response.mensagem || 'Senha redefinida. Entre com a nova senha.');
    } catch (err) {
      setError(err.message || 'Não foi possível redefinir a senha.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell login title="Workly - Redefinir senha">
      {() => (
        <div className="mx-auto w-[480px] max-w-full rounded-2xl border border-workly-rule bg-workly-card px-10 py-12 legacy-max-480:px-6 legacy-max-480:py-9 dark:border-white/10 dark:bg-workly-night-raised">
          <Link to="/" aria-label="Workly, página inicial" className="mb-10 inline-flex w-fit">
            <img alt="Workly" src={logo} className="block w-[118px] dark:[filter:invert(1)_hue-rotate(180deg)]" />
          </Link>
          <h1 className="font-workly-display text-[2rem] leading-tight font-semibold tracking-[-0.025em] text-workly-ink-warm [font-variation-settings:'opsz'_96] dark:text-[#ecebe5]">
            Redefinir senha
          </h1>
          {done ? (
            <>
              <p role="status" className={`${notice} mt-6 bg-workly-primary-tint text-workly-primary-ink`}>
                {done}
              </p>
              <Link to="/login" className={`${submitStyles} inline-flex items-center justify-center`}>
                Ir para o login
              </Link>
            </>
          ) : !token ? (
            <>
              <p role="alert" className={`${notice} mt-6 ${warning}`}>
                Este link de redefinição está incompleto. Solicite um novo pela tela de login.
              </p>
              <Link to="/login" className={`${linkStyles} text-sm font-semibold`}>
                Voltar ao login
              </Link>
            </>
          ) : (
            <form onSubmit={submit} aria-busy={busy} className="mt-2" noValidate>
              <p className="mb-8 text-workly-muted-warm dark:text-[#9aa59f]">
                Escolha uma nova senha com pelo menos 8 caracteres. Depois disso, as sessões abertas em outros
                aparelhos serão encerradas.
              </p>
              {error && (
                <p role="alert" className={`${notice} ${warning}`}>
                  {error}
                </p>
              )}
              <AuthField
                id="novaSenha"
                name="novaSenha"
                label="Nova senha*"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
              />
              <AuthField
                id="confirmarSenha"
                name="confirmarSenha"
                label="Confirmar nova senha*"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
              />
              <Button appearance="custom" type="submit" disabled={busy} className={submitStyles}>
                {busy ? <LoadingState inline message="Salvando…" /> : 'Salvar nova senha'}
              </Button>
              <p className="mt-6 border-t border-workly-rule pt-6 text-center text-sm text-workly-muted-warm dark:border-white/10 dark:text-[#9aa59f]">
                <Link to="/login" className={`${linkStyles} font-semibold`}>
                  Voltar ao login
                </Link>
              </p>
            </form>
          )}
        </div>
      )}
    </AuthShell>
  );
}
