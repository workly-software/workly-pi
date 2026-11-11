import { categories } from '../../services/catalogService';

const photos = {
  1: 'design',
  2: 'programacao',
  3: 'video',
  4: 'ia',
  5: 'escrita',
  6: 'fotografia',
  7: 'audio'
};

export const offices = categories.map((category) => {
  const base = `/assets/img/oficios/${photos[category.id]}`;
  return {
    ...category,
    label: category.label,
    photo: `${base}.jpg`,
    covers: [`${base}.jpg`, `${base}-2.jpg`, `${base}-3.jpg`]
  };
});

const plain = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function officeFor(service) {
  const name = plain(service?.nomeCategoria);
  return offices.find((office) => plain(office.name) === name || plain(office.label) === name);
}

export function assignCovers(services) {
  const seen = {};
  return services.map((service) => {
    const office = officeFor(service);
    if (!office) return undefined;
    const turn = seen[office.id] || 0;
    seen[office.id] = turn + 1;
    return office.covers[turn % office.covers.length];
  });
}

export function serviceImage(item, fallback) {
  const own = item?.imagemServico;
  if (own && !own.includes('servico_padrao')) return own;
  const office = officeFor({ nomeCategoria: item?.nomeCategoria || item?.categoria || item?.nome_genero });
  if (!office) return fallback;
  let sum = 2166136261;
  for (const char of String(item?.idServico || item?.id_servico || item?.idContrato || item?.id || '')) sum = Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0;
  sum = (sum ^ (sum >>> 16)) >>> 0;
  sum = Math.imul(sum, 0x45d9f3b) >>> 0;
  sum = (sum ^ (sum >>> 16)) >>> 0;
  return office.covers[sum % office.covers.length];
}
