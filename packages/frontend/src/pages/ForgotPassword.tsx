import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Logo } from '@/components/Logo';

/**
 * Sem servidor de e-mail não há link de redefinição: quem perdeu a senha
 * pede a troca para quem administra o painel (Configurações → Usuários).
 */
export default function ForgotPassword() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 h-64 w-64 rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-32 h-64 w-64 rounded-full bg-foreground/3 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-4 animate-sentinel-in">
        <div className="mb-10 text-center">
          <Logo size="lg" className="justify-center" />
        </div>

        <div className="liquid-glass rounded-2xl p-8 text-center">
          <KeyRound className="mx-auto mb-4 h-12 w-12 text-accent-readable" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Esqueceu a senha?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Peça a quem administra o painel para definir uma senha nova para o
            seu usuário, em Configurações → Usuários.
          </p>
          <Link to="/login">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o login
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
