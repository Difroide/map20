import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function useWorkspaces() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const effectiveUserId = user?.id;

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ['workspaces', effectiveUserId],
    queryFn: async () => {
      return api.get<Workspace[]>('/workspaces');
    },
    enabled: !!effectiveUserId,
    staleTime: 5 * 60 * 1000,
  });

  const createWorkspace = useCallback(async (name: string) => {
    try {
      const data = await api.post<Workspace>('/workspaces', { name });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast({ title: 'Container criado' });
      return data || null;
    } catch (err: any) {
      toast({ title: 'Erro ao criar container', description: err.message, variant: 'destructive' });
      return null;
    }
  }, [queryClient, toast]);

  const updateWorkspace = useCallback(async (workspaceId: string, name: string) => {
    try {
      await api.patch(`/workspaces/${workspaceId}`, { name });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      return true;
    } catch {
      toast({ title: 'Erro ao renomear container', variant: 'destructive' });
      return false;
    }
  }, [queryClient, toast]);

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    try {
      await api.delete(`/workspaces/${workspaceId}`);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast({ title: 'Container excluído' });
      return true;
    } catch {
      toast({ title: 'Erro ao excluir container', variant: 'destructive' });
      return false;
    }
  }, [queryClient, toast]);

  return {
    workspaces,
    isLoading,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  };
}
