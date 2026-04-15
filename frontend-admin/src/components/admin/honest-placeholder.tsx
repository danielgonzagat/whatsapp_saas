import { Construction } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Honest "em construção" card rendered by every module route until its own
 * sub-project lands. Per CLAUDE.md: no fake data, no fake loading skeleton
 * pretending to fetch something, no random numbers. Just the truth.
 */
export function HonestPlaceholder({
  module,
  plannedSubProject,
  description,
}: {
  module: string;
  plannedSubProject: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="max-w-xl">
        <CardHeader>
          <div className="mb-3 flex items-center gap-2">
            <Construction className="size-4 text-primary" />
            <Badge variant="ember">{plannedSubProject}</Badge>
          </div>
          <CardTitle className="text-lg">{module}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Esta tela ainda não está conectada ao motor. Quando o sub-projeto{' '}
            <strong className="text-foreground">{plannedSubProject}</strong> for concluído, ela
            mostrará dados reais (sem placeholders, sem <code>Math.random</code>). Até lá, o painel
            exibe este estado honesto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
