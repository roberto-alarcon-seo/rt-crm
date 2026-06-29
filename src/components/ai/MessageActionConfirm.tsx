import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Action {
  label: string;
  description?: string;
}

interface Props {
  title: string;
  summary: string;
  actions?: Action[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  confirmed?: boolean;
  cancelled?: boolean;
}

export function MessageActionConfirm({
  title,
  summary,
  actions,
  onConfirm,
  onCancel,
  confirmed,
  cancelled,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Acción ejecutada correctamente</span>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <XCircle className="w-4 h-4 shrink-0" />
        <span>Acción cancelada</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-amber-400">{title}</p>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>

      {actions && actions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>
                <span className="font-medium">{a.label}</span>
                {a.description && (
                  <span className="text-muted-foreground"> — {a.description}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-500 hover:bg-amber-400 text-black font-medium"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
          )}
          Confirmar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
          disabled={loading}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
