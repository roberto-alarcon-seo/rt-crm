import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  caption?: string;
  pageSize?: number;
}

function exportCSV(columns: string[], rows: Record<string, unknown>[], caption?: string) {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(escape).join(','), ...rows.map(r => columns.map(c => escape(r[c])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(caption ?? 'reporte').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MessageTable({ columns, rows, caption, pageSize = 8 }: Props) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / pageSize);
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex flex-col gap-2">
      {(caption || rows.length > 0) && (
        <div className="flex items-center justify-between gap-2">
          {caption && <p className="text-xs font-medium text-muted-foreground">{caption}</p>}
          {rows.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1 ml-auto shrink-0"
              onClick={() => exportCSV(columns, rows, caption)}
            >
              <Download className="w-3 h-3" />
              CSV
            </Button>
          )}
        </div>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2 text-foreground">
                      {String(row[col] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} de {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
