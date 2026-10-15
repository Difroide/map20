import { Box } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function NoWorkspace() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Box className="h-7 w-7 text-accent-readable" />
        </div>
        <h2 className="mb-1 text-lg font-semibold text-foreground">Nenhum container</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Crie um container na barra lateral ("Novo container"). Cada um tem o próprio snippet, pixel, webhooks e preview.
        </p>
      </CardContent>
    </Card>
  );
}
