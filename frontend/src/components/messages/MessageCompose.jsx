import { useRef } from 'react';
import { LoadingState } from '../ui/Feedback';

export default function MessageCompose({ direct = false, text, setText, busy, onSend }) {
  const form = useRef(null);
  return (
    <form
      ref={form}
      id={direct ? 'chatForm' : 'messageForm'}
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (value) onSend(value);
      }}
      className="border-t border-workly-rule bg-workly-card p-3 sm:p-4"
    >
      <div className="flex items-end gap-2 rounded-lg border border-workly-rule bg-workly-paper p-1.5 transition-[border-color,box-shadow] focus-within:border-workly-forest focus-within:shadow-[0_0_0_3px_rgba(14,59,44,0.14)] dark:focus-within:border-workly-dark-accent">
        <textarea
          id={direct ? 'chatText' : 'messageText'}
          aria-label={direct ? 'Escreva sua mensagem' : 'Digite sua mensagem'}
          maxLength="2000"
          required
          rows={direct ? 2 : 2}
          placeholder={direct ? 'Escreva sua mensagem…' : 'Digite sua mensagem…'}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={
            direct
              ? undefined
              : (event) => {
                  if (
                    event.key !== 'Enter' ||
                    event.shiftKey ||
                    event.ctrlKey ||
                    event.altKey ||
                    event.metaKey ||
                    event.nativeEvent.isComposing
                  )
                    return;
                  event.preventDefault();
                  if (text.trim() && !busy) form.current.requestSubmit();
                }
          }
          className="max-h-[160px] min-h-12 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-[0.95rem] leading-relaxed text-workly-ink-warm outline-none placeholder:text-workly-muted-warm focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-workly-forest px-4 font-semibold text-workly-on-forest transition-[background-color,transform] duration-150 hover:bg-workly-forest-raised motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-workly-dark-accent dark:text-workly-night"
        >
          <i aria-hidden="true" className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane'} />
          <span className="legacy-max-480:sr-only">
            {busy ? <LoadingState inline message="Enviando…" /> : 'Enviar'}
          </span>
        </button>
      </div>
      {!direct && (
        <p className="mt-1.5 px-1 text-xs text-workly-muted-warm legacy-max-720:hidden">
          Enter envia · Shift + Enter quebra a linha
        </p>
      )}
    </form>
  );
}
