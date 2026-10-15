import { DashboardLayout } from '@/components/DashboardLayout';
import { CheckoutIntegrationsSection } from '@/components/integrations/CheckoutIntegrationsSection';
import { MetaCapiCard } from '@/components/integrations/MetaCapiCard';
import { NoWorkspace } from '@/components/NoWorkspace';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

/**
 * A configuração do container: o snippet (client web), os webhooks dos
 * checkouts (clients do servidor) e a API de Conversões do Meta (as tags).
 */
export default function Integrations() {
  const { activeWorkspace } = useWorkspaceContext();

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-8 animate-sentinel-in">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Integrações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O que entra (a página e os webhooks do checkout) e o que sai para o Meta
            {activeWorkspace && (
              <>
                {' '}— container <span className="font-medium text-foreground">{activeWorkspace.name}</span>
              </>
            )}
          </p>
        </div>

        {!activeWorkspace ? (
          <NoWorkspace />
        ) : (
          <>
            <MetaCapiCard />
            <Separator />
            <CheckoutIntegrationsSection />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
