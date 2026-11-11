import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { EmptyState, LoadingState } from '../ui/Feedback';
import AuthField from './AuthField';
import { submitStyles } from './authPresentation';
import { requestPasswordReset } from '../../services/authService';

export default function RecoveryModal({ onClose, opener }) {
  const dialog = useRef(null);
  const backButton = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      opener.current?.focus();
    };
  }, []);
  useEffect(() => {
    if (result) backButton.current?.focus();
  }, [result]);
  async function submit(event) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email').trim();
    setBusy(true);
    try {
      const response = await requestPasswordReset(email);
      setResult({ tone: 'ok', text: response.mensagem });
    } catch (error) {
      setResult({ tone: error.status === 503 ? 'unavailable' : 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="recovery-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[400px] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-lg border-0 bg-workly-card p-[30px] text-center text-[#333] shadow-workly  backdrop:bg-black/50 legacy-max-480:p-6 dark:border dark:border-[rgba(170,180,172,0.18)] dark:bg-workly-night-raised dark:text-workly-dark-text"
    >
      <EmptyState>
        <h2 id="recovery-title" className="mb-[15px] text-[1.375rem] font-semibold text-workly-ink-warm">
          Recuperação de senha
        </h2>
        {!result && (
          <p className="mb-5 text-sm text-[#777] dark:text-workly-dark-text">
            Informe o e-mail da sua conta para receber as instruções de redefinição.
          </p>
        )}
      </EmptyState>
      {result ? (
        <p
          role="status"
          className={`mb-6 rounded-md px-3.5 py-3 text-left text-sm leading-relaxed ${
            result.tone === 'ok'
              ? 'bg-workly-primary-tint text-workly-primary-ink'
              : 'bg-[#fdf3e2] text-[#8a5000] dark:bg-[#f2c14e]/15 dark:text-[#f2c14e]'
          }`}
        >
          {result.text}
        </p>
      ) : (
        <form onSubmit={submit} className="text-left" aria-busy={busy}>
          <AuthField
            variant="recovery"
            id="recovery-email"
            name="email"
            type="email"
            label="E-mail"
            placeholder="seuemail@exemplo.com"
            autoComplete="email"
            required
          />
          <Button appearance="custom" type="submit" disabled={busy} className={`${submitStyles} mb-3`}>
            {busy ? <LoadingState inline message="Aguarde…" /> : 'Continuar'}
          </Button>
        </form>
      )}
      <Button ref={backButton} appearance="custom" type="button" onClick={onClose} className={result ? submitStyles : 'text-sm text-workly-muted-warm underline-offset-4 hover:underline'}>
        Voltar ao login
      </Button>
    </dialog>
  );
}
