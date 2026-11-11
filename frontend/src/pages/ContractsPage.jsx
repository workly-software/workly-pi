import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import CatalogShell from '../components/catalog/CatalogShell';
import { LoadingState } from '../components/ui/Feedback';
import {
  ModuleButton,
  ModuleEmpty,
  ModulePage,
  ModuleToast,
  useModuleToast
} from '../components/ui/ModuleUI';
import { contractAction, myContracts, reviewContract } from '../services/contractService';
import ContractSection from '../components/contracts/ContractSection';
import { markNotificationRead } from '../services/notificationService';

export default function ContractsPage() {
  const [params] = useSearchParams(),
    [items, setItems] = useState(null),
    [error, setError] = useState(''),
    [message, toast] = useModuleToast(),
    [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    setItems(null);
    setError('');
    try {
      setItems(await myContracts());
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error.message);
    }
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      if (params.get('notificacoes') === 'contratos') {
        try {
          await markNotificationRead({
            contexto: 'contratos',
            referenciaId: params.get('contrato')
          });
          window.dispatchEvent(new Event('workly:notifications'));
        } catch (error) {
          console.error('Erro ao limpar notificações de contratos:', error);
        }
      }
      if (active) load();
    })();
    return () => {
      active = false;
    };
  }, [load, params]);
  const focusId = params.get('contrato');
  useEffect(() => {
    if (!focusId || !items?.length) return;
    const row = document.querySelector(`[data-contract-id="${CSS.escape(focusId)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.setAttribute('data-highlight', '');
    const timer = setTimeout(() => row.removeAttribute('data-highlight'), 2400);
    return () => clearTimeout(timer);
  }, [focusId, items]);
  async function action(id, name, body) {
    try {
      const result = await contractAction(id, name, body);
      toast(result?.mensagem || 'Contrato atualizado');
      await load();
      return true;
    } catch (error) {
      toast(error.message);
      if ([403, 409].includes(error.status) || (error.status === 400 && !body)) await load();
      return false;
    }
  }
  async function review(payload) {
    try {
      await reviewContract(payload);
      toast('Avaliação enviada');
      await load();
    } catch (error) {
      toast(error.message);
    }
  }
  return (
    <CatalogShell title="Contratos" footer="empty">
      <ModulePage
        kicker={
          <>
            <i aria-hidden="true" className="fas fa-briefcase" />
            Área do usuário
          </>
        }
        title="Meus contratos"
        description="Acompanhe serviços contratados, trabalhos recebidos e finalize contratos para liberar avaliações."
      >
        <div id="contratos-list" className="grid gap-6">
          {error ? (
            <ModuleEmpty
              error
              title="Erro ao carregar"
              message={error}
              icon="fa-triangle-exclamation"
            />
          ) : items === null ? (
            <LoadingState message="Carregando contratos..." />
          ) : items.length ? (
            <>
              <ContractSection
                key={'client' + revision}
                items={items.filter((c) => c.papel === 'cliente')}
                onAction={action}
                onReview={review}
              />
              <ContractSection
                key={'seller' + revision}
                received
                items={items.filter((c) => c.papel === 'freelancer')}
                onAction={action}
                onReview={review}
              />
            </>
          ) : (
            <ModuleEmpty
              title="Nenhum contrato ainda"
              message="Quando você contratar ou receber um serviço, ele aparecerá aqui."
            >
              <ModuleButton to="/todos-servicos">Explorar serviços</ModuleButton>
            </ModuleEmpty>
          )}
        </div>
      </ModulePage>
      <ModuleToast message={message} />
    </CatalogShell>
  );
}
