import { useRef, useState } from "react";
import {
  Upload, FileText, FileImage, FileSpreadsheet, FileArchive, File as FileIcon,
  Download, Eye, Trash2, Loader2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useAccountDocuments, useUploadAccountDocuments, useDeleteAccountDocument,
  getAccountDocumentUrl, formatFileSize, AccountDocument, MAX_FILE_BYTES,
} from "@/hooks/useAccountDocuments";
import { DOC_CATEGORIES, labelOf } from "@/lib/accountConstants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface AccountDocumentsSectionProps {
  /**
   * Empresa a la que pertenecen los documentos. Si es null estamos en
   * /accounts/new: los archivos se acumulan en `stagedFiles` y el editor los
   * sube en cuanto la empresa existe.
   */
  accountId?: string | null;
  canManage: boolean;
  stagedFiles?: File[];
  onStagedFilesChange?: (files: File[]) => void;
}

function iconFor(fileName: string, mime?: string | null) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return FileImage;
  if (["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (["zip", "rar", "7z"].includes(ext)) return FileArchive;
  if (["pdf", "doc", "docx", "txt"].includes(ext)) return FileText;
  return FileIcon;
}

export function AccountDocumentsSection({
  accountId, canManage, stagedFiles = [], onStagedFilesChange,
}: AccountDocumentsSectionProps) {
  const isStaging = !accountId;

  const { documents, isLoading } = useAccountDocuments(accountId ?? undefined);
  const uploadDocs = useUploadAccountDocuments();
  const deleteDoc = useDeleteAccountDocument();

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [category, setCategory] = useState("otro");
  const [pendingDelete, setPendingDelete] = useState<AccountDocument | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);

    const tooBig = files.filter(f => f.size > MAX_FILE_BYTES);
    if (tooBig.length) {
      toast.error(`${tooBig.length} archivo(s) superan el límite de 50 MB`, {
        description: tooBig.map(f => f.name).join(", "),
      });
    }
    const accepted = files.filter(f => f.size <= MAX_FILE_BYTES);
    if (!accepted.length) return;

    if (isStaging) {
      onStagedFilesChange?.([...stagedFiles, ...accepted]);
    } else {
      uploadDocs.mutate({ accountId: accountId!, files: accepted, category });
    }
  };

  /**
   * La ventana se abre ANTES del await: si se abriera después, el bloqueador
   * de pop-ups la mataría por no venir de un gesto directo del usuario.
   */
  const openDocument = async (doc: AccountDocument, download: boolean) => {
    setBusyDocId(doc.id);
    const win = download ? null : window.open("", "_blank");
    try {
      const url = await getAccountDocumentUrl(doc.file_path, {
        download: download ? doc.file_name : undefined,
      });
      if (!url) {
        win?.close();
        return;
      }
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (win) {
        win.location.href = url;
      } else {
        window.open(url, "_blank", "noopener");
      }
    } finally {
      setBusyDocId(null);
    }
  };

  const removeStaged = (index: number) => {
    onStagedFilesChange?.(stagedFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Zona de carga */}
      {canManage && (
        <div className="space-y-3">
          {!isStaging && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Categoría:</span>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={e => {
              e.preventDefault();
              setDragActive(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
            )}
          >
            {uploadDocs.isPending ? (
              <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-primary" />
            ) : (
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {uploadDocs.isPending ? "Subiendo…" : "Arrastra archivos o haz clic para seleccionar"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, imágenes, Word, Excel, PowerPoint, ZIP · hasta 50 MB por archivo · sin límite de cantidad
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
      )}

      {/* Archivos en espera (solo en /accounts/new) */}
      {isStaging && stagedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {stagedFiles.length} archivo(s) se subirán al guardar la empresa
          </p>
          {stagedFiles.map((file, i) => {
            const Icon = iconFor(file.name, file.type);
            return (
              <div key={`${file.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-dashed border-border p-2.5">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">Pendiente</Badge>
                <Button
                  type="button" size="icon" variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeStaged(i)}
                  aria-label={`Quitar ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Documentos guardados */}
      {!isStaging && (
        isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin documentos todavía</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => {
              const Icon = iconFor(doc.file_name, doc.file_type);
              const busy = busyDocId === doc.id;
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>·</span>
                      <span>{format(new Date(doc.created_at), "d MMM yyyy", { locale: es })}</span>
                      {doc.doc_category && doc.doc_category !== "otro" && (
                        <>
                          <span>·</span>
                          <Badge variant="secondary" className="h-4 text-[10px] px-1.5">
                            {labelOf(DOC_CATEGORIES, doc.doc_category)}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      type="button" size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => openDocument(doc, false)}
                      disabled={busy}
                      aria-label={`Ver ${doc.file_name}`}
                      title="Ver"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      type="button" size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => openDocument(doc, true)}
                      disabled={busy}
                      aria-label={`Descargar ${doc.file_name}`}
                      title="Descargar"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {canManage && (
                      <Button
                        type="button" size="icon" variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDelete(doc)}
                        aria-label={`Eliminar ${doc.file_name}`}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={o => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-medium text-foreground">{pendingDelete?.file_name}</span> de
              forma permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDoc.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async e => {
                e.preventDefault();
                if (!pendingDelete) return;
                await deleteDoc.mutateAsync(pendingDelete);
                setPendingDelete(null);
              }}
              disabled={deleteDoc.isPending}
            >
              {deleteDoc.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
