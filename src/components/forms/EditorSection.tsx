import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Bloque de formulario compartido por los editores de página (Empresa, Contacto…).
 * Renderiza una tarjeta con header (ícono en chip, título, hint opcional).
 * El `id` se expone como `section-<id>` para el índice lateral y el scroll-spy;
 * `scroll-mt-24` compensa la barra pegajosa al saltar desde el índice.
 */
export function EditorSection({
  id, icon: Icon, title, hint, children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card id={`section-${id}`} className="scroll-mt-24">
      <CardHeader className="pb-4 border-b border-border/50">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1">{title}</span>
          {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">{children}</CardContent>
    </Card>
  );
}
