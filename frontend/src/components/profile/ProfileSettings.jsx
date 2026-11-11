import { useEffect, useState } from 'react';
import FormField from '../ui/FormField';
import Button from '../ui/Button';
import { LoadingState } from '../ui/Feedback';
import { showAuthAlert } from '../auth/authPresentation';
import {
  updateProfile,
  updateAccountType,
  updatePassword,
  deleteAccount,
  emailChanged
} from '../../services/profileService';
import { limparSessao, obterUsuario } from '../../services/authService';
import { defaultProfileImage } from '../../services/catalogService';

const control =
  'w-full min-w-0 rounded-md border border-workly-rule bg-workly-paper/50 px-3.5 py-3 text-[0.95rem] [line-height:normal] text-workly-ink-warm outline-none transition-[border-color,box-shadow] focus:border-workly-forest focus:shadow-[0_0_0_3px_rgba(14,59,44,0.14)] disabled:cursor-not-allowed disabled:opacity-60 dark:focus:border-workly-dark-accent';
export const saveStyle =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-workly-forest px-5 font-semibold text-workly-on-forest transition-[background-color,transform] hover:bg-workly-forest-raised motion-safe:active:scale-[0.97] disabled:opacity-60 dark:bg-workly-dark-accent dark:text-workly-night';
export const cancelStyle =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-workly-rule bg-workly-card px-5 font-semibold text-workly-ink-warm transition-colors hover:border-workly-forest/40';
const sections = [
  ['profile', 'Perfil', 'fa-user', 'Perfil'],
  ['portfolio', 'Portfólio', 'fa-briefcase', 'Portfólio e serviços'],
  ['account', 'Conta', 'fa-cog', 'Conta'],
  ['billing', 'Pagamentos', 'fa-credit-card', 'Pagamentos'],
  ['notification', 'Notificações', 'fa-bell', 'Notificações'],
  ['security', 'Segurança', 'fa-shield-alt', 'Segurança']
];
const areas = [
  'Design',
  'Programação',
  'Vídeo/Edição',
  'Inteligência Artificial',
  'Escrita/Tradução',
  'Fotografia',
  'Áudio/Música'
];
function initialFields(user) {
  const parts = String(user.nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    ...user,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    notificacoesEmail: user.notificacoesEmail ?? true,
    notificacoesPropostas: user.notificacoesPropostas ?? true,
    notificacoesMarketing: user.notificacoesMarketing ?? false,
    doisFatores: user.doisFatores ?? false
  };
}
export default function ProfileSettings({ user, reload, onPhoto }) {
  const [active, setActive] = useState('profile'),
    [values, setValues] = useState(() => initialFields(user)),
    [busy, setBusy] = useState(false);
  useEffect(() => setValues(initialFields(user)), [user]);
  const set = (key, value) => setValues((previous) => ({ ...previous, [key]: value }));
  function field(key, label, type = 'text', placeholder = '', options) {
    return (
      <FormField
        key={key}
        id={key}
        name={key}
        label={label}
        appearance="custom"
        className={`${control} ${['linkedin', 'github', 'instagram'].includes(key) ? 'rounded-l-none' : ''}`}
        wrapperClassName={
          ['linkedin', 'github', 'instagram'].includes(key) ? 'min-w-0 flex-1' : undefined
        }
        labelClassName={
          ['linkedin', 'github', 'instagram'].includes(key)
            ? 'sr-only'
            : 'mb-2 block font-medium dark:text-[#e8e4da]'
        }
        type={options ? undefined : type}
        as={options ? 'select' : type === 'textarea' ? 'textarea' : 'input'}
        value={values[key] || ''}
        onChange={(event) => set(key, event.target.value)}
        placeholder={placeholder}
        rows={type === 'textarea' ? 4 : undefined}
        minLength={['novaSenha', 'confirmarSenha'].includes(key) ? 8 : undefined}
        autoComplete={
          type === 'password'
            ? key === 'senhaAtual'
              ? 'current-password'
              : 'new-password'
            : undefined
        }
      >
        {options?.map((option) => (
          <option key={option} value={option === options[0] ? '' : option}>
            {option}
          </option>
        ))}
      </FormField>
    );
  }
  // unavailable: the channel is not implemented yet, so the switch is shown off and cannot be changed.
  function toggle(key, title, description, unavailable = false) {
    return (
      <label
        key={key}
        className={`flex min-w-0 items-center justify-between gap-5 border-b border-workly-rule py-6 ${unavailable ? 'cursor-not-allowed' : ''}`}
      >
        <span className={`min-w-0 ${unavailable ? 'opacity-70' : ''}`}>
          <strong className="block">
            {title}
            {unavailable && (
              <span className="ml-2 inline-block rounded-full bg-workly-sunken px-2 py-0.5 align-middle text-xs font-semibold text-workly-muted-warm dark:bg-white/10 dark:text-[#9aa59f]">
                Indisponível no momento
              </span>
            )}
          </strong>
          <small className="mt-1 block text-sm leading-relaxed text-workly-muted-warm">{description}</small>
        </span>
        <input
          type="checkbox"
          aria-label={unavailable ? `${title} (indisponível no momento)` : title}
          checked={unavailable ? false : Boolean(values[key])}
          disabled={unavailable}
          onChange={(event) => set(key, event.target.checked)}
          className="h-[18px] w-[18px] shrink-0 accent-workly-primary focus-visible:outline-2 focus-visible:outline-workly-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>
    );
  }
  const group = (keys) => Object.fromEntries(keys.map((key) => [key, values[key] || '']));
  async function submit(event, section) {
    event?.preventDefault();
    if (busy) return;
    if (section === 'account') {
      if (values.tipoConta === 'Freelancer' && !values.areaAtuacao) {
        await showAuthAlert({
          icon: 'warning',
          title: 'Informe a área de atuação',
          text: 'Para usar a conta como freelancer, selecione uma área de atuação.',
          confirmText: 'Entendi'
        });
        return;
      }
      if (
        !(
          await showAuthAlert({
            icon: 'warning',
            title: 'Alterar tipo de conta?',
            text: 'Essa mudança pode alterar permissões, serviços disponíveis e a visualização do seu perfil.',
            confirmText: 'Confirmar',
            cancelText: 'Cancelar'
          })
        ).isConfirmed
      )
        return;
    }
    // the login e-mail only changes with the current password; the other sessions are signed out.
    let senhaAtual;
    if (section === 'profile' && emailChanged(obterUsuario()?.email, values.email)) {
      const confirmation = await showAuthAlert({
        icon: 'warning',
        title: 'Confirme sua senha',
        text: 'Para alterar o e-mail de acesso, informe sua senha atual. Os outros dispositivos conectados serão desconectados.',
        password: { label: 'Senha atual', required: 'Informe sua senha atual.' },
        confirmText: 'Alterar e-mail',
        cancelText: 'Cancelar'
      });
      if (!confirmation.isConfirmed) return;
      senhaAtual = confirmation.value;
    }
    const titles = {
      profile: 'Perfil atualizado!',
      portfolio: 'Portfólio atualizado!',
      account: 'Tipo de conta atualizado!',
      billing: 'Pagamentos atualizados!',
      notification: 'Notificações atualizadas!',
      security: 'Senha atualizada!',
      preferences: 'Preferências de segurança salvas!'
    };
    const errors = {
      profile: ['Erro ao atualizar perfil', 'Não foi possível salvar as alterações do seu perfil.'],
      portfolio: ['Erro ao salvar', 'Não foi possível salvar o portfólio.'],
      account: [
        'Não foi possível alterar',
        'Verifique se você possui serviços publicados ou contratos ativos antes de mudar o tipo da conta.'
      ],
      billing: ['Erro ao salvar', 'Não foi possível salvar os dados de pagamento.'],
      notification: ['Erro ao salvar', 'Não foi possível salvar as notificações.'],
      security: ['Erro ao atualizar senha', 'Não foi possível atualizar a senha.'],
      preferences: ['Erro ao salvar', 'Não foi possível salvar as preferências de segurança.']
    };
    setBusy(true);
    try {
      let result;
      if (section === 'account')
        result = await updateAccountType(group(['tipoConta', 'areaAtuacao']));
      else if (section === 'security') {
        result = await updatePassword(group(['senhaAtual', 'novaSenha', 'confirmarSenha']));
        setValues((previous) => ({
          ...previous,
          senhaAtual: '',
          novaSenha: '',
          confirmarSenha: '',
          doisFatores: obterUsuario()?.doisFatores || false
        }));
      } else {
        const payload =
          section === 'profile'
            ? {
                ...group([
                  'email',
                  'telefone',
                  'tituloProfissional',
                  'bio',
                  'localizacao',
                  'site',
                  'linkedin',
                  'github',
                  'instagram',
                  'areaAtuacao'
                ]),
                nome: `${values.firstName || ''} ${values.lastName || ''}`.trim(),
                ...(senhaAtual ? { senhaAtual } : {})
              }
            : section === 'portfolio'
              ? group([
                  'portfolioTitulo',
                  'portfolioDescricao',
                  'portfolioUrl',
                  'disponibilidade',
                  'precoHora'
                ])
              : section === 'billing'
                ? group(['metodoPagamento', 'chavePix', 'banco'])
                : section === 'preferences'
                  ? { doisFatores: Boolean(values.doisFatores) }
                  : // only the in-app preference works today; e-mail and marketing keep their stored values.
                    { notificacoesPropostas: Boolean(values.notificacoesPropostas) };
        result = await updateProfile(payload);
      }
      if (section !== 'security' && section !== 'profile') await reload();
      await showAuthAlert({
        icon: 'success',
        title: titles[section],
        text:
          result.mensagem ||
          (section === 'profile'
            ? 'As informações do seu perfil foram salvas com sucesso.'
            : section === 'security'
              ? 'Sua senha foi alterada com sucesso.'
              : section === 'account'
                ? 'A configuração da conta foi alterada com sucesso.'
                : 'Alterações salvas com sucesso.'),
        confirmText: 'Continuar'
      });
      if (section === 'profile') await reload();
    } catch (error) {
      await showAuthAlert({
        icon: 'error',
        title: errors[section][0],
        text: error.message || errors[section][1],
        confirmText: 'Fechar'
      });
    } finally {
      setBusy(false);
    }
  }
  // Account removal anonymises the profile; finished contracts, reviews and messages stay for the other party.
  const removalDetails = `
    <div style="text-align:left">
      <p style="margin:0 0 10px"><strong>Será removido:</strong> nome, e-mail, CPF, telefone, foto, dados de pagamento, links e seus serviços publicados.</p>
      <p style="margin:0 0 10px"><strong>Fica no histórico da outra parte:</strong> contratos concluídos ou cancelados, avaliações e mensagens, exibidos como “Usuário removido”.</p>
      <p style="margin:0">Contratos em andamento precisam ser concluídos ou cancelados antes. Esta ação não pode ser desfeita.</p>
    </div>`;
  async function remove(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await showAuthAlert({
        icon: 'warning',
        title: 'Excluir conta?',
        html: removalDetails,
        password: { label: 'Confirme com sua senha atual', required: 'Informe sua senha atual.' },
        confirmText: 'Excluir conta',
        cancelText: 'Cancelar',
        danger: true,
        onConfirm: async (senha) => {
          try {
            await deleteAccount(senha);
            return undefined;
          } catch (error) {
            return error.message || 'Não foi possível excluir sua conta.';
          }
        }
      });
      if (!result.isConfirmed) return;
      limparSessao();
      await showAuthAlert({
        icon: 'success',
        symbol: 'fa-user-slash',
        title: 'Conta excluída',
        text: 'Sua conta foi removida e você saiu de todos os dispositivos.',
        confirmText: 'OK'
      });
      location.assign('/');
    } finally {
      setBusy(false);
    }
  }

  function actions(label, section) {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-workly-rule pt-6">
        <Button
          type="button"
          appearance="custom"
          className="rounded-lg border border-workly-rule bg-transparent px-[25px] py-3 text-sm font-semibold text-workly-muted-warm focus-visible:outline-2 focus-visible:outline-workly-primary dark:border-[#3a4741]/22 dark:text-[#ecebe5]"
          onClick={() => setValues(initialFields(user))}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          appearance="custom"
          disabled={busy}
          className={`${saveStyle} text-sm`}
        >
          {label}
        </Button>
      </div>
    );
  }
  const row = 'mb-5 flex gap-5 [&>div]:flex-1 [&>div]:mb-0 legacy-max-920:flex-col';
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-6 legacy-max-920:grid-cols-1">
      <nav
        aria-label="Configurações"
        className="sticky top-6 min-w-0 legacy-max-920:static"
      >
        <p className="mb-4 px-3 text-xs font-semibold tracking-[0.16em] uppercase text-workly-muted-warm">Sua conta</p><div className="flex flex-col gap-1 legacy-max-920:flex-row legacy-max-920:overflow-x-auto legacy-max-920:[scrollbar-width:none]">
          {sections.map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              aria-current={active === key ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-3 text-left text-[0.95rem] font-medium whitespace-nowrap transition-colors ${active === key ? 'bg-workly-forest text-workly-on-forest dark:bg-workly-primary-tint dark:text-workly-primary-ink' : 'text-workly-muted-warm hover:bg-workly-paper hover:text-workly-ink-warm'}`}
            >
              <i aria-hidden="true" className={`fas ${icon} w-5 text-center`} />
              {label}
            </button>
          ))}
        </div>
      </nav>
      <div className="w-full min-w-0 max-w-[820px] rounded-xl border border-workly-rule bg-workly-card p-5 sm:p-7">
        {sections.map(([key, , , heading]) => (
          <section key={key} hidden={active !== key}>
            <h2 className="font-workly-display text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-workly-ink-warm">
              {heading}
            </h2>            <p className="mt-2 mb-5 border-b border-workly-rule pb-4 text-sm leading-relaxed text-workly-muted-warm">
              {{ profile: 'Sua apresentação na Workly. Mantenha seus dados e canais de contato atualizados.', portfolio: 'Organize suas referências profissionais e sua disponibilidade.', account: 'Escolha como você participa da plataforma.', billing: 'Gerencie os dados de pagamento informados no seu perfil.', notification: 'Escolha quais comunicações você deseja receber.', security: 'Cuide do acesso à sua conta e mantenha sua senha atualizada.' }[key]}
            </p>
            {key === 'profile' && (
              <>
                <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-workly-rule pb-6">
                  <img
                    src={user.fotoPerfil || defaultProfileImage}
                    alt="Foto de perfil atual"
                    className="h-16 w-16 shrink-0 rounded-full bg-workly-sunken object-cover shadow-[0_0_0_1px_var(--color-workly-rule)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-workly-ink-warm">Foto de perfil</p>
                    <p className="mt-0.5 text-sm text-workly-muted-warm">JPG, PNG ou WEBP. Recorte e ajuste antes de salvar.</p>
                  </div>
                  <Button
                    appearance="custom"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-workly-rule bg-workly-card px-4 text-sm leading-none font-semibold text-workly-ink-warm transition-colors hover:border-workly-forest/40 hover:bg-workly-paper focus-visible:outline-2 focus-visible:outline-workly-primary"
                    onClick={onPhoto}
                  >
                    <i aria-hidden="true" className="fas fa-camera text-workly-primary-ink" />
                    Alterar foto
                  </Button>
                </div>
                <form onSubmit={(event) => submit(event, key)}>
                  <div className={row}>
                    {field('firstName', 'Nome', 'text', 'Seu nome')}
                    {field('lastName', 'Sobrenome', 'text', 'Seu sobrenome')}
                  </div>
                  {field(
                    'tituloProfissional',
                    'Título Profissional',
                    'text',
                    'Ex.: Desenvolvedor Web'
                  )}
                  {field(
                    'bio',
                    'Biografia',
                    'textarea',
                    'Fale um pouco sobre sua experiência e seus serviços.'
                  )}
                  <div className={row}>
                    {field('email', 'Email', 'email', 'seuemail@exemplo.com')}
                    {field('telefone', 'Telefone', 'tel', '(00) 00000-0000')}
                  </div>
                  {field('localizacao', 'Localização', 'text', 'Cidade, Estado')}
                  {field('site', 'Website', 'url', 'https://seusite.com')}
                  <div className="mb-5">
                    <p className="mb-2 font-medium">Redes Sociais</p>
                    <div className="flex flex-col gap-2.5">
                      {[
                        ['linkedin', 'LinkedIn', 'linkedin.com/in/seu-perfil'],
                        ['github', 'GitHub', 'github.com/seuusuario'],
                        ['instagram', 'Instagram', 'instagram.com/seuusuario']
                      ].map(([name, label, placeholder]) => (
                        <div key={name} className="flex items-stretch">
                          <span aria-hidden="true" className="grid w-12 shrink-0 self-stretch place-items-center rounded-l-md border border-r-0 border-workly-rule bg-workly-paper text-workly-muted-warm"><i className={`fab fa-${name}`} /></span>
                          {field(name, label, 'text', placeholder)}
                        </div>
                      ))}
                    </div>
                  </div>
                  {actions('Salvar Alterações', key)}
                </form>
                <form onSubmit={remove} className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-500/20 bg-red-500/5 p-5"><div><h3 className="font-semibold text-workly-ink-warm">Excluir conta</h3><p className="mt-1 text-sm text-workly-muted-warm">Esta ação é permanente e não pode ser desfeita.</p></div>
                  <Button
                    appearance="custom"
                    type="submit"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-500/30 px-4 text-sm font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-300"
                    disabled={busy}
                  >
                    <i aria-hidden="true" className="fa-solid fa-trash" /> Excluir conta
                  </Button>
                </form>
              </>
            )}
            {key === 'portfolio' && (
              <form onSubmit={(event) => submit(event, key)}>
                <div className="mb-5 flex gap-3 bg-[#04bf55]/8 p-[18px]">
                  <i aria-hidden="true" className="fas fa-circle-info text-workly-primary-ink" />
                  <div>
                    <strong>Esses dados ajudam a montar uma vitrine profissional.</strong>
                    <p>
                      Por enquanto eles ficam salvos no seu perfil. Depois podem virar uma página
                      pública de portfólio.
                    </p>
                  </div>
                </div>
                {field(
                  'portfolioTitulo',
                  'Título do portfólio',
                  'text',
                  'Ex.: Sites modernos para pequenos negócios'
                )}
                {field(
                  'portfolioDescricao',
                  'Descrição do portfólio',
                  'textarea',
                  'Conte quais tipos de projetos você quer destacar.'
                )}
                <div className={row}>
                  {field('portfolioUrl', 'Link externo', 'url', 'https://meuportfolio.com')}
                  {field('disponibilidade', 'Disponibilidade', 'text', '', [
                    'Selecione',
                    'Disponível para novos projetos',
                    'Agenda parcial',
                    'Indisponível no momento'
                  ])}
                </div>
                {field(
                  'precoHora',
                  'Valor por hora / referência',
                  'text',
                  'Ex.: R$ 50/h ou a combinar'
                )}
                {actions('Salvar portfólio', key)}
              </form>
            )}
            {key === 'account' && (
              <>
                <div className="mb-[18px] flex gap-[14px]">
                  <i aria-hidden="true" className="fas fa-user-gear text-workly-primary-ink" />
                  <div>
                    <strong>Tipo de conta</strong>
                    <p>
                      Essa alteração muda permissões, serviços e como seu perfil aparece na Workly.
                    </p>
                  </div>
                </div>
                <div className="mb-[18px] flex justify-between gap-3 bg-workly-primary/9 px-4 py-[14px]">
                  <span>Tipo atual</span>
                  <strong>{user.tipoConta || '--'}</strong>
                </div>
                <form onSubmit={(event) => submit(event, key)}>
                  <div className={row}>
                    <FormField
                      id="tipoConta"
                      label="Alterar para"
                      as="select"
                      appearance="custom"
                      className={control}
                      value={values.tipoConta || 'Freelancer'}
                      onChange={(event) => set('tipoConta', event.target.value)}
                    >
                      <option>Freelancer</option>
                      <option>Contratante</option>
                    </FormField>
                    <div hidden={values.tipoConta !== 'Freelancer'}>
                      {field('areaAtuacao', 'Área de atuação', 'text', '', [
                        'Selecione sua área...',
                        ...areas
                      ])}
                    </div>
                  </div>
                  <p className="mb-5 bg-[#f59e0b]/8 p-[18px]">
                    {values.tipoConta === 'Freelancer'
                      ? 'Para virar freelancer, escolha uma área de atuação. Isso libera recursos como publicar serviços e receber leads.'
                      : 'Para virar contratante, você não pode ter serviços publicados ou contratos ativos como freelancer.'}
                  </p>
                  {actions('Confirmar alteração', key)}
                </form>
              </>
            )}
            {key === 'billing' && (
              <form onSubmit={(event) => submit(event, key)}>
                <div className="mb-5 bg-workly-primary/8 p-[18px]">
                  <strong>Dados preparados para uma futura integração financeira.</strong>
                  <p>Nenhuma cobrança real é feita pelo sistema neste momento.</p>
                </div>
                <div className={row}>
                  {field('metodoPagamento', 'Método preferido', 'text', '', [
                    'Selecione',
                    'Pix',
                    'Transferência bancária',
                    'A combinar com o cliente'
                  ])}
                  {field(
                    'chavePix',
                    'Chave Pix',
                    'text',
                    'Email, CPF, telefone ou chave aleatória'
                  )}
                </div>
                {field(
                  'banco',
                  'Banco / observações',
                  'text',
                  'Ex.: Nubank, Banco do Brasil ou instruções de pagamento'
                )}
                {actions('Salvar pagamentos', key)}
              </form>
            )}
            {key === 'notification' && (
              <form onSubmit={(event) => submit(event, key)}>
                <h3 className="mt-2 text-sm font-semibold tracking-wide text-workly-muted-warm uppercase">
                  Avisos na plataforma
                </h3>
                {toggle(
                  'notificacoesPropostas',
                  'Novas propostas e mensagens',
                  'Avisos no sino quando chegarem pedidos, propostas ou mensagens novas.'
                )}
                <p className="mt-3 text-sm leading-relaxed text-workly-muted-warm">
                  Avisos sobre o andamento dos seus contratos (aceite, valor combinado, entrega, ajustes,
                  cancelamento e avaliações) chegam sempre, porque fazem parte da negociação.
                </p>
                <h3 className="mt-8 text-sm font-semibold tracking-wide text-workly-muted-warm uppercase">
                  Outros canais
                </h3>
                {toggle(
                  'notificacoesEmail',
                  'Notificações por e-mail',
                  'A Workly ainda não envia e-mails. Esta opção será liberada quando o envio estiver disponível.',
                  true
                )}
                {toggle(
                  'notificacoesMarketing',
                  'Novidades e marketing',
                  'A Workly ainda não envia comunicações de marketing.',
                  true
                )}
                {actions('Salvar notificações', key)}
              </form>
            )}
            {key === 'security' && (
              <form onSubmit={(event) => submit(event, key)}>
                <div className={row}>
                  {field('senhaAtual', 'Senha atual', 'password')}
                  {field('novaSenha', 'Nova senha', 'password')}
                </div>
                {field('confirmarSenha', 'Confirmar nova senha', 'password')}
                <p className="my-4 text-sm text-workly-muted-warm dark:text-[#9aa59f]">
                  A verificação em duas etapas ainda não está disponível nesta versão.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Button type="submit" appearance="custom" className={saveStyle} disabled={busy}>
                    Atualizar senha
                  </Button>
                </div>
              </form>
            )}
          </section>
        ))}
        {busy && <LoadingState inline message="Salvando..." />}
      </div>
    </div>
  );
}
