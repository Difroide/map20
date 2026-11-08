import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Bug, DollarSign, Flame, Link2, Radio, Settings, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';

const navItems = [
  { to: '/sales', icon: DollarSign, label: 'Vendas' },
  { to: '/live', icon: Radio, label: 'Ao vivo' },
  { to: '/heatmap', icon: Flame, label: 'Mapa de calor' },
  { to: '/preview', icon: Bug, label: 'Preview e debug' },
  { to: '/integrations', icon: Link2, label: 'Integrações' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

export function Sidebar({ onNavClick, onCollapsedChange }: { onNavClick?: () => void; onCollapsedChange?: (collapsed: boolean) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();

  const toggleCollapsed = (val: boolean) => {
    setCollapsed(val);
    onCollapsedChange?.(val);
  };

  return (
    <aside
      className={cn(
        'h-full glass-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between border-b border-foreground/5 px-4">
          {!collapsed && <Logo />}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleCollapsed(!collapsed)}
            className="text-muted-foreground/70 hover:text-foreground hover:bg-foreground/5"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <WorkspaceSwitcher collapsed={collapsed} />

        <nav className="flex-1 space-y-1 p-3 pt-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                  isActive
                    ? 'bg-foreground/8 text-foreground font-medium'
                    : 'text-muted-foreground/80 hover:text-foreground hover:bg-foreground/5'
                )
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-foreground/5 p-3 space-y-1">
          <div className={cn('flex', collapsed ? 'justify-center' : 'justify-end')}>
            <ThemeToggle collapsed={collapsed} />
          </div>
          {!collapsed && user && (
            <p className="mb-2 truncate px-3 text-xs text-muted-foreground/80">
              {user.email}
            </p>
          )}
          <Button
            variant="ghost"
            onClick={logout}
            className={cn(
              'w-full justify-start gap-3 text-muted-foreground/80 hover:text-foreground hover:bg-foreground/5 rounded-lg',
              collapsed && 'justify-center px-0'
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
            {!collapsed && <span className="text-sm">Sair</span>}
          </Button>
        </div>
      </div>
    </aside>
  );
}
