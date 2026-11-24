import { useEffect, useRef } from 'react';
import CatalogShell from '../components/catalog/CatalogShell';

const members = [
  {
    name: 'Cauã',
    role: 'Desenvolvedor',
    image: '20250404_083557.jpg',
    text: 'Tenho 20 anos, estudo na FATEC desde 2023 e atualmente curso Desenvolvimento de Software Multiplataforma. Atuo como desenvolvedor da Workly.',
    href: 'https://github.com/CauaMora'
  },
  {
    name: 'Vitor',
    role: 'Desenvolvedor',
    image: 'vitor.webp',
    text: 'Estudo Desenvolvimento de Software Multiplataforma na FATEC Jaú e atuo como desenvolvedor da Workly.',
    href: 'https://github.com/vitorperasoli'
  },
  {
    name: 'José',
    role: 'Design / Figma',
    image: 'Screenshot_4.png',
    text: 'Sou estudante da FATEC Jaú no curso de Desenvolvimento de Software Multiplataforma e ajudo a Workly principalmente na parte de identidade visual e design da experiência.',
    href: 'https://github.com/jose-antonio89'
  },
  {
    name: 'Luiz',
    role: 'Documentação',
    image: 'IMG-20250615-WA0008.jpg',
    text: 'Tenho 18 anos e curso Desenvolvimento de Software Multiplataforma na FATEC Jaú, contribuindo com a organização e documentação do projeto.',
    href: '#'
  }
];

export default function AboutPage() {
  const container = useRef(null);
  useEffect(() => {
    const reveal = () =>
      container.current?.querySelectorAll('[data-team-member]').forEach((member) => {
        const rect = member.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom >= 0) member.dataset.visible = 'true';
      });
    window.addEventListener('scroll', reveal);
    reveal();
    return () => window.removeEventListener('scroll', reveal);
  }, []);
  return (
    <CatalogShell title="Sobre Nós" showCategories={false}>
      <main
        ref={container}
        className="mx-auto my-14 max-w-[1280px] px-10 text-center leading-[1.6] legacy-max-720:px-6"
      >
        <h1 className="mb-4 font-workly-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-workly-ink-warm [font-variation-settings:'opsz'_96] dark:text-[#ecebe5]">
          Conheça nossa equipe
        </h1>
        <p className="mx-auto mb-11 max-w-[760px] text-[1.02rem] text-workly-muted-warm dark:text-[#9aa59f]">
          A Workly nasceu para conectar empresas e freelancers de forma simples, rápida e
          profissional. Esse é o time por trás do projeto.
        </p>
        {members.map((member, index) => (
          <section
            key={member.name}
            data-team-member
            data-visible="false"
            className={`mb-7 grid translate-y-6 grid-cols-[180px_minmax(0,1fr)] motion-reduce:translate-y-0 motion-reduce:opacity-100 items-center gap-7 text-left opacity-0 transition-[opacity,transform] duration-[500ms] ease-workly-out data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100 dark:items-stretch dark:gap-6 legacy-max-860:grid-cols-1 legacy-max-860:text-center ${index % 2 === 1 ? 'min-[861px]:grid-cols-[minmax(0,1fr)_180px]' : ''}`}
          >
            <div className={`flex justify-center ${index % 2 === 1 ? 'min-[861px]:order-2' : ''}`}>
              <img
                loading="lazy"
                decoding="async"
                src={`/assets/img/${member.image}`}
                alt={`Foto do ${member.name}`}
                className="size-[170px] rounded-[50%] border-4 border-[rgba(22,33,27,.06)] object-cover shadow-[0_1px_2px_rgba(22,33,27,0.05)] dark:border-white/[.08] dark:shadow-none"
              />
            </div>
            <div className="py-5">
              <h2 className="mb-1.5 font-workly-display text-[1.75rem] font-semibold tracking-[-0.015em] text-workly-ink-warm dark:text-[#ecebe5]">
                {member.name}
              </h2>
              <h3 className="mb-[14px] text-[1.17rem] font-medium text-workly-muted-warm dark:text-[#9aa59f]">
                {member.role}
              </h3>
              <p className="mb-4 text-workly-ink-warm/80 dark:text-[#9aa59f]">{member.text}</p>
              <a
                href={member.href}
                target={member.href === '#' ? undefined : '_blank'}
                rel={member.href === '#' ? undefined : 'noopener noreferrer'}
                className="inline-flex items-center gap-2 font-semibold text-workly-primary-ink hover:text-[#036b33] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-workly-primary dark:text-[#9aa59f] dark:hover:text-[#86efac]"
              >
                <i
                  aria-hidden="true"
                  className={
                    member.href === '#' ? 'fa-regular fa-file-lines' : 'fa-brands fa-github'
                  }
                />
                {member.href === '#' ? 'Em breve' : 'GitHub'}
              </a>
            </div>
          </section>
        ))}
      </main>
    </CatalogShell>
  );
}
