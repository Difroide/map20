import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { apiChangePassword } from '@/lib/authClient';
import { useAuth } from '@/contexts/AuthContext';

/** Troca de senha no /api/auth: a sessão do próprio usuário basta. */
export function PasswordCard() {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = !!confirm && password !== confirm;
  const tooShort = !!password && password.length < 8;

  const salvar = async () => {
    setSaving(true);
    try {
      await apiChangePassword(password);
    } catch (error: any) {
      setSaving(false);
      toast({ title: 'Não foi possível trocar a senha', description: error?.message, variant: 'destructive' });
      return;
    }
    setSaving(false);
    setPassword('');
    setConfirm('');
    toast({ title: 'Senha alterada' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conta</CardTitle>
        <CardDescription>{user?.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="new-password" className="text-xs">Nova senha</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {tooShort && <p className="text-xs text-destructive">Use pelo menos 8 caracteres.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-password" className="text-xs">Repita a senha</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <p className="text-xs text-destructive">As senhas não batem.</p>}
          </div>
        </div>
        <Button onClick={salvar} disabled={saving || !password || tooShort || password !== confirm}>
          {saving ? 'Salvando...' : 'Trocar senha'}
        </Button>
      </CardContent>
    </Card>
  );
}
