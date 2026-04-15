'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { firstName, resolveGreeting } from '@/components/admin/admin-greeting';
import { useAdminSession } from '@/lib/auth/admin-session-context';

export default function AdminHomePage() {
  const { admin } = useAdminSession();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const greeting = useMemo(() => resolveGreeting(now.getHours()), [now]);
  const name = admin ? firstName(admin.name) : '';

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {now.toLocaleString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {greeting}
          {name ? `, ${name}` : ''}.
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          O painel está operacional. Os módulos chegam em sub-projetos sequenciais — cada um com
          spec, plan, testes e PULSE clean antes de tocar dados reais.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Badge variant="ember">SP-1</Badge>
            <CardTitle className="text-base">Identidade & IAM</CardTitle>
            <CardDescription>
              OWNER/MANAGER/STAFF, 2FA obrigatório, audit append-only.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Pronto. Você está logado através deste motor.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Badge variant="ember">SP-2</Badge>
            <CardTitle className="text-base">Shell administrativo</CardTitle>
            <CardDescription>
              Sidebar, saudação dinâmica, notificação, chatbar skeleton.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Pronto. Navegue pela sidebar — cada módulo mostra estado honesto.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Badge variant="default">SP-3</Badge>
            <CardTitle className="text-base">God View Dashboard</CardTitle>
            <CardDescription>
              KPIs, gráficos, cohort, top rankings — com dados reais.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Próximo sub-projeto. Nenhum dado fake até lá.
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
