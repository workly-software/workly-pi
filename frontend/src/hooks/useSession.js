import { useEffect, useState } from 'react';
import { buscarUsuarioAtual, sessaoIniciada } from '../services/authService.js';

export default function useSession() {
  const [status, setStatus] = useState(() => (sessaoIniciada() ? 'loading' : 'guest'));
  useEffect(() => {
    let active = true;
    const expired = () => {
      if (active) setStatus('guest');
    };
    window.addEventListener('workly:session-expired', expired);
    if (sessaoIniciada()) {
      buscarUsuarioAtual(true).then((user) => {
        if (active) setStatus(!sessaoIniciada() ? 'guest' : user ? 'authenticated' : 'error');
      });
    }
    return () => {
      active = false;
      window.removeEventListener('workly:session-expired', expired);
    };
  }, []);
  return status;
}
