import { ReactNode, useState } from 'react';
import { Logo } from '@/components/Logo';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkspaceSync } from '@/components/WorkspaceSync';
import { ThemeToggle } from '@/components/ThemeToggle';

interface DashboardLayoutProps {
  children: ReactNode;
  /** Ocupa a largura toda, sem o respiro lateral grande (o preview precisa de espaço). */
  wide?: boolean;
}

export function DashboardLayout({ children, wide }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <WorkspaceSync />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 transform transition-all duration-300 lg:translate-x-0',
          sidebarCollapsed ? 'w-16' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar onNavClick={() => setSidebarOpen(false)} onCollapsedChange={setSidebarCollapsed} />
      </div>

      <div className={cn('transition-all duration-300', sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <div className="sticky top-0 z-20 flex h-14 items-center gap-4 glass-header px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <main className={cn('p-4', wide ? 'lg:px-6 lg:py-6' : 'lg:px-8 lg:pb-8 lg:pt-10')}>{children}</main>
      </div>
    </div>
  );
}
