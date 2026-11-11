import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

export const submitStyles =
  'w-full cursor-pointer rounded-md border-0 bg-workly-forest px-4 py-3 text-base leading-[normal] font-semibold text-workly-on-forest transition-[background-color,transform] duration-150 ease-workly-out hover:bg-workly-forest-raised motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-workly-dark-accent dark:text-workly-night dark:hover:bg-[#6ee7a0]';
export const registrationSubmitStyles =
  'mt-2.5 w-full cursor-pointer rounded-md border-0 bg-workly-forest px-4 py-3 text-base leading-[normal] font-semibold text-workly-on-forest transition-[background-color,transform] duration-150 ease-workly-out hover:bg-workly-forest-raised motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-workly-dark-accent dark:text-workly-night dark:hover:bg-[#6ee7a0]';
export const linkStyles =
  'font-medium text-workly-primary-ink underline-offset-4 hover:underline dark:text-workly-dark-accent';
export const glow = '[filter:invert(1)_hue-rotate(180deg)]';

const alertTones = {
  success: { symbol: 'fa-check', light: 'bg-[#e7f6ee]! text-[#037a3a]!', dark: 'bg-[#5fd394]/12! text-[#5fd394]!' },
  info: { symbol: 'fa-info', light: 'bg-[#e8eef5]! text-[#2f5d8a]!', dark: 'bg-[#93c5fd]/12! text-[#93c5fd]!' },
  warning: { symbol: 'fa-exclamation', light: 'bg-[#fdf3e2]! text-[#8a5000]!', dark: 'bg-[#f2c14e]/14! text-[#f2c14e]!' },
  error: { symbol: 'fa-xmark', light: 'bg-[#fde8e8]! text-[#9b1c1c]!', dark: 'bg-[#fda4af]/14! text-[#fda4af]!' }
};

export function showAuthAlert({
  icon = 'info',
  symbol,
  title,
  text,
  html,
  confirmText = 'OK',
  cancelText,
  danger = false,
  password,
  onConfirm
}) {
  const dark = localStorage.getItem('darkMode') === 'enabled';
  const opener = document.activeElement;
  const tone = alertTones[icon] || alertTones.info;
  return Swal.fire({
    icon,
    iconHtml: `<i aria-hidden="true" class="fas ${symbol || tone.symbol}"></i>`,
    title,
    ...(html ? { html } : { text }),
    ...(password
      ? {
          input: 'password',
          inputLabel: password.label,
          inputPlaceholder: password.placeholder || '',
          inputAttributes: { autocomplete: 'current-password', 'aria-label': password.label },
          inputValidator: (value) => (!value ? password.required || 'Informe sua senha.' : undefined)
        }
      : {}),
    ...(onConfirm
      ? {
          showLoaderOnConfirm: true,
          allowOutsideClick: () => !Swal.isLoading(),
          preConfirm: async (value) => {
            const problem = await onConfirm(value);
            if (problem) {
              Swal.showValidationMessage(problem);
              return false;
            }
            return value ?? true;
          }
        }
      : {}),
    confirmButtonText: confirmText,
    showCancelButton: Boolean(cancelText),
    cancelButtonText: cancelText,
    reverseButtons: true,
    ...(danger && cancelText ? { didOpen: () => Swal.getCancelButton()?.focus() } : {}),
    focusCancel: Boolean(cancelText) && (danger || icon === 'warning'),
    ...(onConfirm ? {} : { allowOutsideClick: true }),
    heightAuto: false,
    buttonsStyling: false,
    returnFocus: false,
    backdrop: 'rgba(12,20,17,0.5)',
    showClass: { popup: 'animate-workly-modal-in', icon: '' },
    hideClass: { popup: 'animate-workly-modal-out', icon: '' },
    customClass: {
      container: 'z-[25000]! p-[18px]!',
      popup: `w-[min(420px,calc(100vw-32px))]! rounded-xl! border! px-8! pt-8! pb-7! font-workly! leading-[normal]! tracking-[0]! overflow-hidden! shadow-[0_24px_48px_-24px_rgba(12,20,17,0.35)]! legacy-max-480:px-6! ${dark ? 'border-white/10! bg-[#131d19]! text-[#ecebe5]!' : 'border-[#ddd8cc]! bg-[#ffffff]! text-[#16211b]!'}`,
      icon: `m-0! mx-auto! mb-5! flex! h-12! w-12! items-center! justify-center! rounded-full! border-0! text-base! leading-none! [&_.swal2-icon-content]:text-base! [&_.swal2-icon-content]:leading-none! ${dark ? tone.dark : tone.light}`,
      title: `m-0! mb-2! p-0! font-workly-display! text-[1.5rem]! leading-[1.15]! font-semibold! tracking-[-0.02em]! [font-variation-settings:'opsz'_48]! ${dark ? 'text-[#ecebe5]!' : 'text-[#16211b]!'}`,
      htmlContainer: `m-0! mx-auto! mb-7! max-w-[320px]! p-0! font-workly! text-[0.95rem]! leading-[1.55]! font-normal! ${dark ? 'text-[#a3ada7]!' : 'text-[#5e6862]!'}`,
      actions: 'm-0! w-full! flex-nowrap! gap-2.5! legacy-max-480:flex-col-reverse!',
      inputLabel: `m-0! mb-2! block! w-full! text-left! text-sm! font-medium! ${dark ? 'text-[#ecebe5]!' : 'text-[#16211b]!'}`,
      input: `m-0! mb-5! h-11! w-full! rounded-md! border! px-3.5! text-[0.95rem]! shadow-none! focus:shadow-[0_0_0_3px_rgba(14,59,44,0.14)]! ${dark ? 'border-white/15! bg-[#0c1411]! text-[#ecebe5]! focus:border-[#4ade80]!' : 'border-[#ddd8cc]! bg-[#f5f3ee]! text-[#16211b]! focus:border-[#0e3b2c]!'}`,
      validationMessage: `m-0! mb-5! justify-start! rounded-md! px-3! py-2! text-left! text-sm! ${dark ? 'bg-[#fda4af]/12! text-[#fda4af]!' : 'bg-[#fde8e8]! text-[#9b1c1c]!'}`,
      cancelButton: `m-0! min-h-11 flex-1 rounded-md border px-5 font-workly text-[0.95rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#037a3a] legacy-max-480:w-full ${dark ? 'border-white/15 bg-transparent text-[#ecebe5] hover:bg-white/5' : 'border-[#ddd8cc] bg-[#ffffff] text-[#16211b] hover:bg-[#f5f3ee]'}`,
      confirmButton: `m-0! min-h-11 flex-1 rounded-md border-0 px-5 font-workly text-[0.95rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#037a3a] legacy-max-480:w-full ${danger ? (dark ? 'bg-[#fda4af] text-[#0c1411] hover:bg-[#fecdd3]' : 'bg-[#b42318] text-[#ffffff] hover:bg-[#912018]') : dark ? 'bg-[#4ade80] text-[#0c1411] hover:bg-[#6ee7a0]' : 'bg-[#0e3b2c] text-[#f3f1ea] hover:bg-[#1d5a43]'}`
    }
  }).then((result) => {
    if (opener?.isConnected) opener.focus();
    return result;
  });
}
