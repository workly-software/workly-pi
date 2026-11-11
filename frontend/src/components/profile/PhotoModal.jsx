import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { LoadingState } from '../ui/Feedback';
import { showAuthAlert } from '../auth/authPresentation';
import { uploadPhoto } from '../../services/profileService';
import { saveStyle, cancelStyle } from './ProfileSettings';

export function cropGeometry(image, size, zoom, x, y) {
  const frameSize = (size * 220) / 280,
    frameStart = (size - frameSize) / 2;
  const width = image.naturalWidth * zoom,
    height = image.naturalHeight * zoom;
  const limitX = Math.max(0, (width - frameSize) / 2),
    limitY = Math.max(0, (height - frameSize) / 2);
  const safeX = Math.min(limitX, Math.max(-limitX, x)),
    safeY = Math.min(limitY, Math.max(-limitY, y));
  return {
    frameSize,
    frameStart,
    width,
    height,
    x: safeX,
    y: safeY,
    drawX: (size - width) / 2 + safeX,
    drawY: (size - height) / 2 + safeY
  };
}
export default function PhotoModal({ close, reload }) {
  const canvas = useRef(null),
    stage = useRef(null),
    url = useRef(''),
    file = useRef(null),
    drag = useRef(null),
    dialog = useRef(null),
    loadId = useRef(0);
  const [image, setImage] = useState(null),
    [crop, setCrop] = useState({ zoom: 1, min: 1, x: 0, y: 0 }),
    [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false),
    [error, setError] = useState('');
  const opener = useRef(document.activeElement);
  useEffect(() => {
    const original = opener.current;
    return () => {
      if (url.current) URL.revokeObjectURL(url.current);
      if (original?.isConnected) original.focus();
    };
  }, []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const items = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="file"]), [tabindex="0"]')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [busy, close]);
  function reset(value = image) {
    if (!value) return;
    const size = Math.round(stage.current?.getBoundingClientRect().width || 280);
    const min = Math.max(
      (size * 220) / 280 / value.naturalWidth,
      (size * 220) / 280 / value.naturalHeight
    );
    setCrop({ zoom: min, min, x: 0, y: 0 });
  }
  useEffect(() => {
    const resize = () => reset();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [image]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const size = Math.round(stage.current.getBoundingClientRect().width || 280);
    canvas.current.width = size;
    canvas.current.height = size;
    const ctx = canvas.current.getContext('2d', { alpha: false });
    ctx.fillStyle = '#0c1411';
    ctx.fillRect(0, 0, size, size);
    const rect = cropGeometry(image, size, crop.zoom, crop.x, crop.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, rect.drawX, rect.drawY, rect.width, rect.height);
  }, [image, crop]);
  useEffect(() => {
    const element = stage.current;
    if (!element || !image) return;
    const wheel = (event) => {
      event.preventDefault();
      setCrop((previous) => ({
        ...previous,
        zoom: Math.min(
          previous.min * 3,
          Math.max(
            previous.min,
            previous.zoom + (event.deltaY > 0 ? -1 : 1) * Math.max(previous.min * 0.08, 0.01)
          )
        )
      }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [image]);
  async function select(event) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError('Escolha uma imagem JPG, PNG ou WEBP.');
      return;
    }
    const request = ++loadId.current;
    const source = URL.createObjectURL(selected);
    const loaded = new Image();
    loaded.onload = () => {
      if (request !== loadId.current) { URL.revokeObjectURL(source); return; }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = source;
      setImage(loaded);
    };
    loaded.onerror = () => {
      URL.revokeObjectURL(source);
      if (request === loadId.current) setError('Não foi possível abrir essa imagem. Tente outro arquivo.');
    };
    loaded.src = source;
  }
  useEffect(() => {
    reset();
  }, [image]);
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (!image) {
      await showAuthAlert({
        icon: 'warning',
        title: 'Escolha uma imagem',
        text: 'Selecione uma foto antes de salvar.',
        confirmText: 'Fechar'
      });
      return;
    }
    setBusy(true);
    try {
      const rect = cropGeometry(image, canvas.current.width, crop.zoom, crop.x, crop.y),
        output = document.createElement('canvas');
      output.width = 512;
      output.height = 512;
      const ctx = output.getContext('2d'),
        scale = 512 / rect.frameSize;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        image,
        (rect.drawX - rect.frameStart) * scale,
        (rect.drawY - rect.frameStart) * scale,
        rect.width * scale,
        rect.height * scale
      );
      const blob = await new Promise((resolve, reject) =>
        output.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error('Não foi possível gerar a imagem recortada.')),
          'image/webp',
          0.92
        )
      );
      const result = await uploadPhoto(blob);
      close();
      await reload();
      await showAuthAlert({
        icon: 'success',
        title: 'Foto atualizada!',
        text: result.mensagem || 'Sua foto foi atualizada com sucesso.',
        confirmText: 'Continuar'
      });
    } catch (error) {
      await showAuthAlert({
        icon: 'error',
        title: 'Erro ao atualizar foto',
        text: error.message || 'Não foi possível atualizar sua foto agora.',
        confirmText: 'Fechar'
      });
    } finally {
      setBusy(false);
    }
  }
  function move(event) {
    if (!drag.current) return;
    const rect = cropGeometry(
      image,
      canvas.current.width,
      crop.zoom,
      drag.current.x + event.clientX - drag.current.startX,
      drag.current.y + event.clientY - drag.current.startY
    );
    setCrop((previous) => ({ ...previous, x: rect.x, y: rect.y }));
  }
  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="photo-title" aria-describedby="photo-description" aria-busy={busy} className="relative my-auto w-full max-w-[440px] overflow-hidden rounded-2xl border border-workly-rule bg-workly-card text-workly-ink-warm shadow-2xl">
        <header className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id="photo-title" className="font-workly-display text-2xl font-semibold tracking-tight">Sua foto de perfil</h2>
            <p id="photo-description" className="mt-1.5 text-sm leading-relaxed text-workly-muted-warm">{image ? 'Ajuste a foto dentro do círculo.' : 'Uma boa foto ajuda as pessoas a reconhecer você.'}</p>
          </div>
          <button type="button" aria-label="Fechar" autoFocus disabled={busy} onClick={close} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-workly-muted-warm transition-colors hover:bg-workly-sunken disabled:opacity-40"><i aria-hidden="true" className="fas fa-xmark" /></button>
        </header>
        <form onSubmit={save} noValidate>
          <div className="px-6 py-6">
            <input ref={file} id="nova_foto" name="nova_foto" type="file" accept="image/jpeg,image/png,image/webp" onChange={select} disabled={busy} hidden className="hidden" />
            {!image ? (
              <button type="button" onClick={() => file.current.click()} className="group flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-workly-rule bg-workly-paper px-5 py-8 transition-colors hover:border-workly-primary-ink hover:bg-workly-primary-tint">
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-workly-card text-xl text-workly-primary-ink"><i aria-hidden="true" className="fas fa-camera" /></span>
                <span className="font-semibold">Escolher uma foto</span>
                <span className="mt-2 text-sm text-workly-muted-warm">JPG, PNG ou WEBP</span>
              </button>
            ) : (
              <>
                <div ref={stage} role="group" aria-label="Enquadramento: arraste ou use as setas do teclado" tabIndex={0}
                  onKeyDown={(event) => {
                    const offsets = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
                    if (!offsets[event.key] || busy) return;
                    event.preventDefault();
                    const [x, y] = offsets[event.key];
                    setCrop((previous) => { const safe = cropGeometry(image, canvas.current.width, previous.zoom, previous.x + x, previous.y + y); return { ...previous, x: safe.x, y: safe.y }; });
                  }}
                  className={`relative mx-auto aspect-square w-[280px] max-w-full touch-none overflow-hidden rounded-xl bg-workly-night ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                  onPointerDown={(event) => {
                    if (busy) return;
                    event.preventDefault();
                    event.currentTarget.focus();
                    const rect = cropGeometry(image, canvas.current.width, crop.zoom, crop.x, crop.y);
                    drag.current = { startX: event.clientX, startY: event.clientY, x: rect.x, y: rect.y };
                    setDragging(true);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={move}
                  onPointerUp={(event) => { drag.current = null; setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                  onPointerCancel={() => { drag.current = null; setDragging(false); }}>
                  <canvas ref={canvas} aria-label="Prévia do recorte da foto" className="block h-full w-full" />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-[10.7142857%] rounded-full border-2 border-white/90 shadow-[0_0_0_200px_rgba(0,0,0,0.65)]" />
                </div>
                <p className="mt-3 text-center text-xs text-workly-muted-warm">Arraste para enquadrar · Use as setas para ajustar</p>
                <div className="mt-5 flex items-center gap-3">
                  <label htmlFor="photo-zoom" className="text-sm font-medium">Zoom</label>
                  <input id="photo-zoom" type="range" min={crop.min} max={crop.min * 3} step="any" value={crop.zoom} disabled={busy} aria-valuetext={`${Math.round(crop.zoom / crop.min * 100)}%`} onChange={(event) => setCrop((previous) => ({ ...previous, zoom: Number(event.target.value) }))} className="min-w-0 flex-1 accent-workly-primary-ink" />
                  <span className="w-10 text-right text-xs text-workly-muted-warm tabular-nums">{Math.round(crop.zoom / crop.min * 100)}%</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button type="button" disabled={busy} onClick={() => file.current.click()} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-workly-primary-ink hover:underline"><i aria-hidden="true" className="fas fa-arrow-rotate-left" />Trocar foto</button>
                  <button type="button" disabled={busy} onClick={() => reset()} className="min-h-10 text-sm text-workly-muted-warm hover:text-workly-ink-warm">Redefinir ajustes</button>
                </div>
              </>
            )}
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
          </div>
          <footer className="flex justify-end gap-3 border-t border-workly-rule bg-workly-paper/50 px-6 py-4">
            <Button appearance="custom" className={cancelStyle} disabled={busy} onClick={close}>Cancelar</Button>
            <Button type="submit" appearance="custom" className={`${saveStyle} disabled:cursor-not-allowed disabled:opacity-40`} disabled={!image || busy}>{busy ? 'Salvando…' : 'Salvar foto'}</Button>
          </footer>
          {busy && <LoadingState inline message="Atualizando sua foto…" />}
        </form>
      </div>
    </div>
  );
}
