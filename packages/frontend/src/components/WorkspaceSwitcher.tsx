import { useState } from 'react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Box, Plus, X, Trash2, Pencil, Check } from 'lucide-react';

/**
 * O "container": cada área tem o próprio snippet, pixel, webhooks e preview.
 * Fica na barra lateral, acima do menu, como o seletor de container do GTM.
 */
export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { activeWorkspaceId, workspaces, setActiveWorkspace } = useWorkspaceContext();
  const { createWorkspace, updateWorkspace, deleteWorkspace } = useWorkspaces();

  const [mode, setMode] = useState<'idle' | 'create' | 'rename'>('idle');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeName = workspaces.find((w) => w.id === activeWorkspaceId)?.name || '';

  if (collapsed) {
    return (
      <div className="flex justify-center border-b border-foreground/5 px-3 py-3" title={activeName}>
        <Box className="h-4 w-4 text-accent-readable" />
      </div>
    );
  }

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    if (mode === 'create') {
      const ws = await createWorkspace(name.trim());
      if (ws) setActiveWorkspace(ws.id);
    } else if (mode === 'rename' && activeWorkspaceId) {
      await updateWorkspace(activeWorkspaceId, name.trim());
    }
    setBusy(false);
    setMode('idle');
    setName('');
  };

  const remove = async () => {
    if (!activeWorkspaceId) return;
    setBusy(true);
    await deleteWorkspace(activeWorkspaceId);
    setBusy(false);
    setConfirmDelete(false);
  };

  return (
    <div className="border-b border-foreground/5 px-3 py-3">
      <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Container</p>

      {mode !== 'idle' ? (
        <div className="flex gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === 'create' ? 'Nome do container' : 'Novo nome'}
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setMode('idle');
            }}
            autoFocus
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={submit} disabled={busy || !name.trim()} aria-label="Confirmar">
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setMode('idle')} aria-label="Cancelar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : workspaces.length > 0 ? (
        <div className="flex items-center gap-1">
          <Select value={activeWorkspaceId || ''} onValueChange={setActiveWorkspace}>
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id} className="text-xs">
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={() => {
              setName(activeName);
              setMode('rename');
            }}
            aria-label="Renomear container"
            title="Renomear"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            aria-label="Excluir container"
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">Nenhum container ainda.</p>
      )}

      {mode === 'idle' && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 w-full justify-start gap-1.5 text-xs text-muted-foreground"
          onClick={() => {
            setName('');
            setMode('create');
          }}
        >
          <Plus className="h-3 w-3" /> Novo container
        </Button>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o container "{activeName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O snippet desta área para de rastrear, os webhooks deixam de ser aceitos e o pixel e o token da API de
              Conversões são apagados. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
