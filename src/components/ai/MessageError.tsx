import { AlertTriangle } from "lucide-react";

interface Props {
  message: string;
  suggestion?: string;
}

export function MessageError({ message, suggestion }: Props) {
  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 flex gap-3">
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-red-400 font-medium">{message}</p>
        {suggestion && (
          <p className="text-xs text-muted-foreground">{suggestion}</p>
        )}
      </div>
    </div>
  );
}
