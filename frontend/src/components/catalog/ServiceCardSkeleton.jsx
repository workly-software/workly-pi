const bone = 'rounded-md bg-workly-sunken motion-safe:animate-pulse';

function CardBones() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col">
      <div className={`aspect-[16/11] rounded-xl ${bone}`} />
      <div className="pt-4">
        <div className="min-h-[2.6em] text-[1.25rem] leading-[1.3]">
          <div className={`h-[1em] w-11/12 ${bone}`} />
          <div className={`mt-[0.3em] h-[1em] w-3/5 ${bone}`} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-6 w-6 shrink-0 rounded-full bg-workly-sunken motion-safe:animate-pulse" />
          <div className={`h-4 w-28 ${bone}`} />
          <div className={`ml-auto h-4 w-16 ${bone}`} />
        </div>
        <div className={`mt-4 h-6 w-24 ${bone}`} />
      </div>
    </div>
  );
}

export default function ServiceCardSkeleton({ count = 6, message = 'Carregando serviços…' }) {
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
      {Array.from({ length: count }, (_, index) => (
        <CardBones key={index} />
      ))}
    </>
  );
}
