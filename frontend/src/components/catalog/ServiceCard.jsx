import { Link } from 'react-router';
import FeaturedCard from '../home/FeaturedCard';
import { officeFor } from '../home/offices';
import Button from '../ui/Button';

function stableCover(service) {
  const office = officeFor(service);
  if (!office) return undefined;
  const key = String(service.idServico || '');
  let sum = 2166136261;
  for (const char of key) sum = Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0;
  sum = (sum ^ (sum >>> 16)) >>> 0;
  sum = Math.imul(sum, 0x45d9f3b) >>> 0;
  sum = (sum ^ (sum >>> 16)) >>> 0;
  return office.covers[sum % office.covers.length];
}

export default function ServiceCard({ service, owner = false, cover, feature = false, onRemove, removing = false }) {
  return (
    <FeaturedCard
      service={service}
      feature={feature}
      categoryCover={cover || stableCover(service)}
      footer={
        owner && (
          <div className="relative z-[1] mt-4 grid gap-2">
          <Link
            to={`/editar-servico?id=${service.idServico}`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-workly-rule font-semibold text-workly-ink-warm transition-colors hover:border-workly-forest/40 hover:text-workly-forest dark:border-white/15 dark:text-[#ecebe5]"
          >
            <i aria-hidden="true" className="fas fa-pen text-sm" />
            Editar serviço
          </Link>
          {onRemove && <Button variant="danger" disabled={removing} onClick={() => onRemove(service)} aria-label={`Remover anúncio ${service.nome}`}>
            <i aria-hidden="true" className="fas fa-trash-can text-sm" /> Remover anúncio
          </Button>}
          </div>
        )
      }
    />
  );
}
