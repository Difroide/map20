import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/services/supabase.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  async list(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('workspaces')
      .select('id, user_id, name, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  async create(userId: string, name: string) {
    if (!name) {
      throw new BadRequestException('name is required');
    }


    const { data, error } = await this.supabase
      .getClient()
      .from('workspaces')
      .insert({ user_id: userId, name })
      .select()
      .single();

    if (error) throw error;


    return data;
  }

  async update(userId: string, workspaceId: string, name: string) {
    if (!workspaceId || !name) {
      throw new BadRequestException('workspace_id and name required');
    }

    const { error } = await this.supabase
      .getClient()
      .from('workspaces')
      .update({ name })
      .eq('id', workspaceId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  }

  async remove(userId: string, workspaceId: string) {
    if (!workspaceId) {
      throw new BadRequestException('workspace_id required');
    }

    const { error } = await this.supabase
      .getClient()
      .from('workspaces')
      .delete()
      .eq('id', workspaceId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  }

}
