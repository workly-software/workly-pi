import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import AuthShell from '../components/auth/AuthShell';
import AuthField from '../components/auth/AuthField';
import AuthHeader from '../components/auth/AuthHeader';
import AuthFooter from '../components/auth/AuthFooter';
import { showAuthAlert, registrationSubmitStyles } from '../components/auth/authPresentation';
import Button from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/Feedback';
import { cadastrar } from '../services/authService';
import { categoryLabel } from '../services/catalogService';
import { areas, formatCpf, validateField, registrationPayload } from '../services/authValidation';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState('');
  const [cpf, setCpf] = useState('');
  const [states, setStates] = useState({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  function validate(control) {
    if (!control.name || control.name === 'newsletter') return '';
    return validateField(
      control.name,
      control.type === 'checkbox' ? control.checked : control.value,
      { required: control.required, type: control.type, senha: control.form.elements.senha.value }
    );
  }
  function blur(event) {
    const control = event.target;
    if (!control.name || control.name === 'newsletter') return;
    setStates((old) => ({ ...old, [control.name]: validate(control) }));
  }
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errors = {};
    for (const control of form.querySelectorAll('input,select'))
      if (control.name !== 'newsletter') errors[control.name] = validate(control);
    setStates(errors);
    if (
      Object.values(errors).some(Boolean) ||
      form.elements.senha.value !== form.elements.confirmar_senha.value ||
      !form.elements.termos.checked
    ) {
      await showAuthAlert({
        icon: 'warning',
        title: 'Revise o formulário',
        text: 'Preencha os campos obrigatórios corretamente antes de continuar.',
        confirmText: 'Entendi'
      });
      return;
    }
    setBusy(true);
    setApiError('');
    try {
      const result = await cadastrar(registrationPayload(new FormData(form)));
      await showAuthAlert({
        icon: 'success',
        title: 'Perfil criado com sucesso!',
        text: result.mensagem || 'Sua conta foi criada. Agora é só fazer login e começar.',
        confirmText: 'Ir para login'
      });
      navigate('/login');
    } catch (err) {
      const text = err.message || 'Falha de conexão. Tente novamente em instantes.';
      setApiError(text);
      void showAuthAlert({
        icon: 'error',
        title: 'Não foi possível concluir o cadastro',
        text,
        confirmText: 'Fechar'
      }).then(() => setApiError(''));
    } finally {
      setBusy(false);
    }
  }
  const field = (id, label, props = {}) => (
    <AuthField
      key={id}
      variant="register"
      id={id}
      name={id}
      label={label}
      error={states[id]}
      valid={states[id] === ''}
      onBlur={blur}
      onChange={props.as === 'select' ? blur : undefined}
      {...props}
    />
  );
  return (
    <AuthShell floatingToggle={false}>
      {(dark, toggleTheme) => (
        <>
          <AuthHeader dark={dark} onToggleTheme={toggleTheme} />
          <section className="mx-auto grid max-w-[1280px] grid-cols-12 gap-x-6 gap-y-10 px-10 pt-14 pb-20 legacy-max-992:pt-8 legacy-max-720:px-6">
            <div className="order-2 col-span-12 self-start lg:sticky lg:top-8 lg:order-none lg:col-span-5">
              <figure className="relative overflow-hidden rounded-xl bg-workly-sunken legacy-max-992:hidden">
                <img
                  src="/assets/img/oficios/design.webp"
                  alt="Mesa de trabalho de designer com esboços e paleta de cores"
                  className="aspect-[4/3] w-full object-cover"
                />
              </figure>
              <h1 className="mt-8 font-workly-display text-[clamp(2rem,3.4vw,2.75rem)] leading-[1.04] font-semibold tracking-[-0.025em] text-balance text-workly-ink-warm [font-variation-settings:'opsz'_96] legacy-max-992:mt-0">
                Do anúncio à avaliação, tudo em um só lugar.
              </h1>
              <ul className="mt-6 grid gap-3.5 border-t border-workly-rule pt-6">
                {[
                  'Anuncie serviços em sete categorias ou encontre quem faça o seu.',
                  'Contrate pelo valor anunciado ou envie uma proposta.',
                  'Converse, acompanhe e avalie pelo contrato.'
                ].map((text) => (
                  <li key={text} className="flex gap-3 leading-relaxed text-workly-muted-warm">
                    <i aria-hidden="true" className="fas fa-check mt-1.5 text-sm text-workly-primary-ink" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="col-span-12 lg:col-span-6 lg:col-start-7">
              <h2 className="font-workly-display text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-workly-ink-warm [font-variation-settings:'opsz'_96] dark:text-[#ecebe5]">
                Crie sua conta
              </h2>
              <p className="mt-2 mb-2 text-workly-muted-warm dark:text-[#9aa59f]">
                Já tem uma conta?{' '}
                <Link to="/login" className="font-semibold text-workly-primary-ink underline-offset-4 hover:underline dark:text-workly-dark-accent">
                  Faça login
                </Link>
              </p>
              <form id="formCadastro" onSubmit={submit} className="mt-5" aria-busy={busy}>
                {field('nome', 'Nome completo*', { required: true })}
                {field('email', 'E-mail*', { required: true, type: 'email' })}
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {field('senha', 'Senha*', { required: true, type: 'password', minLength: 8 })}
                  {field('confirmar_senha', 'Confirmar senha*', { required: true, type: 'password' })}
                </div>
                <div className="grid gap-x-4 sm:grid-cols-2">
                {field('cpf', 'CPF*', {
                  required: true,
                  maxLength: 14,
                  inputMode: 'numeric',
                  autoComplete: 'off',
                  placeholder: '000.000.000-00',
                  value: cpf,
                  onChange: (event) => setCpf(formatCpf(event.target.value))
                })}
                {field('telefone', 'Telefone')}
                </div>
                {field('tipo_conta', 'Você é*', {
                  as: 'select',
                  required: true,
                  value: tipo,
                  onChange: (event) => {
                    setTipo(event.target.value);
                    const area = event.target.form.elements.area_atuacao;
                    if (event.target.value !== 'Freelancer') area.value = '';
                    blur(event);
                  },
                  children: (
                    <>
                      <option value="">Selecione...</option>
                      <option value="Freelancer">Freelancer (oferecer serviços)</option>
                      <option value="Contratante">Contratante (contratar serviços)</option>
                    </>
                  )
                })}
                <div hidden={tipo !== 'Freelancer'}>
                  {field('area_atuacao', 'Área de atuação*', {
                    as: 'select',
                    required: tipo === 'Freelancer',
                    children: (
                      <>
                        <option value="">Selecione sua área...</option>
                        {areas.map((area) => (
                          <option key={area} value={area}>
                            {categoryLabel(area)}
                          </option>
                        ))}
                      </>
                    )
                  })}
                </div>
                {['termos', 'newsletter'].map((id) => (
                  <div key={id} className="relative mb-[15px] flow-root min-w-0 pl-[30px]">
                    <input
                      id={id}
                      name={id}
                      type="checkbox"
                      required={id === 'termos'}
                      onBlur={blur}
                      onChange={blur}
                      className="peer absolute top-0 left-0 h-5 w-5 cursor-pointer opacity-0"
                    />
                    <label
                      htmlFor={id}
                      aria-hidden="true"
                      className="pointer-events-none absolute top-0 left-0 h-5 w-5 rounded border border-workly-rule bg-workly-card peer-checked:border-workly-forest peer-checked:bg-workly-forest peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-workly-primary after:absolute after:top-[3px] after:left-[7px] after:hidden after:h-2.5 after:w-[5px] after:rotate-45 after:border-r-2 after:border-b-2 after:border-white peer-checked:after:block"
                    />
                    <label
                      htmlFor={id}
                      className="mb-2 block cursor-pointer text-[0.95rem] text-workly-ink-warm legacy-max-576:text-sm dark:text-workly-dark-text"
                    >
                      {id === 'termos' ? (
                        <>
                          Eu li e aceito os{' '}
                          <span className="font-semibold">
                            Termos de Serviço
                          </span>{' '}
                          e{' '}
                          <span className="font-semibold">
                            Política de Privacidade
                          </span>
                          *
                        </>
                      ) : (
                        'Desejo receber novidades e promoções por e-mail'
                      )}
                    </label>
                    {states[id] && (
                      <ErrorState className="text-[0.85rem] text-[#be123c] dark:text-[#fda4af]">
                        {states[id]}
                      </ErrorState>
                    )}
                  </div>
                ))}
                <Button
                  appearance="custom"
                  type="submit"
                  disabled={busy}
                  className={registrationSubmitStyles}
                >
                  {busy ? <LoadingState inline message="Criando conta…" /> : 'Criar conta'}
                </Button>
                {apiError && <ErrorState className="sr-only">{apiError}</ErrorState>}
              </form>
            </div>
          </section>
          <AuthFooter />
        </>
      )}
    </AuthShell>
  );
}
