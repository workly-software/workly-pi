import { Link } from 'react-router';
import SiteFooter, { FooterSection } from '../SiteFooter';
import { sessaoIniciada } from '../../services/authService';

const link =
  'inline-flex min-h-11 w-fit items-center font-medium text-workly-text-muted underline-offset-4 transition-colors hover:text-workly-primary-ink hover:underline dark:text-[#9aa59f] dark:hover:text-workly-dark-accent';
const paperLink =
  'inline-flex min-h-11 w-fit items-center font-medium text-workly-ink-warm underline-offset-4 transition-colors hover:text-workly-forest hover:underline dark:text-[#ecebe5] dark:hover:text-workly-dark-accent';
const section = 'mb-[30px] w-[300px] max-w-full';
const explore = [
  'Explorar',
  [
    ['/todos-servicos', 'Todos os serviços'],
    ['/sobre', 'Sobre Nós']
  ]
];
const guestAccount = [
  ['/login', 'Entrar'],
  ['/cadastro', 'Criar conta']
];
const memberAccount = [
  ['/perfil', 'Meu perfil'],
  ['/contratos', 'Contratos'],
  ['/mensagens', 'Mensagens']
];
export default function AuthFooter({
  catalog = false,
  detail = false,
  about = false,
  compact = false,
  flush = false,
  tone = 'paper'
}) {
  const sectionStyle = catalog ? (detail || about || compact ? '' : 'mb-[30px]') : section;
  const headingStyle = catalog && (detail || about || compact) ? '' : 'pb-2.5';
  const groups = [explore, ['Sua conta', sessaoIniciada() ? memberAccount : guestAccount]];
  return (
    <SiteFooter
      catalog={catalog}
      flush={flush}
      tone={tone}
      lineHeight={about ? 1.6 : undefined}
      bottom={`© ${new Date().getFullYear()} Workly. Todos os direitos reservados.`}
    >
      <FooterSection
        title="Sobre a Workly"
        tone={tone}
        className={sectionStyle}
        headingClassName={headingStyle}
      >
        <p
          className={`max-w-[310px] leading-[1.7] ${tone === 'paper' ? 'text-workly-muted-warm dark:text-[#9aa59f]' : 'text-workly-text-muted dark:text-[#9aa59f]'}`}
        >
          Conectando empresas aos melhores freelancers desde 2025.
        </p>
      </FooterSection>
      {groups.map(([title, links]) => (
        <FooterSection
          key={title}
          title={title}
          tone={tone}
          className={sectionStyle}
          headingClassName={headingStyle}
        >
          <ul className="grid">
            {links.map(([to, text]) => (
              <li key={to}>
                <Link to={to} className={tone === 'paper' ? paperLink : link}>
                  {text}
                </Link>
              </li>
            ))}
          </ul>
        </FooterSection>
      ))}
    </SiteFooter>
  );
}
