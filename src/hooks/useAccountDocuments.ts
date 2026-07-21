import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { toast } from "sonner";

/**
 * Documentos adjuntos a una empresa.
 *
 * El bucket `account-documents` es PRIVADO, así que guardamos la ruta y no una
 * URL: cualquier URL persistida caducaría. La URL firmada se pide al momento de
 * ver o descargar. (El módulo de propiedades hace lo contrario —
 * PropertyMultimediaTab llama getPublicUrl sobre un bucket privado— y por eso
 * sus enlaces no abren.)
 */

export const ACCOUNT_DOCS_BUCKET = "account-documents";

/** Tope por archivo. No hay tope en la cantidad de documentos por empresa. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface AccountDocument {
  id: string;
  tenant_id: string;
  account_id: string;
  file_path: string;
  file_name: string;
  file_type?: string | null;
  file_size?: number | null;
  doc_category: string;
  uploaded_by?: string | null;
  created_at: string;
}

export function useAccountDocuments(accountId?: string) {
  const effectiveTenantId = useEffectiveTenantId();

  const { data: documents = [], isLoading } = useQuery<AccountDocument[]>({
    queryKey: ["account-documents", accountId, effectiveTenantId],
    enabled: !!accountId && !!effectiveTenantId,
    queryFn: async () => {
      if (!accountId || !effectiveTenantId) return [];
      const { data, error } = await (supabase as any)
        .from("account_documents")
        .select("*")
        .eq("account_id", accountId)
        .eq("tenant_id", effectiveTenantId)
        .order("created_at", { ascending: false });
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data || []) as AccountDocument[];
    },
  });

  return { documents, isLoading };
}

/** Nombre seguro para Storage: sin acentos, espacios ni caracteres raros. */
function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas: café → cafe
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80); // conserva la extensión aunque el nombre sea larguísimo
}

export function useUploadAccountDocuments() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      accountId,
      files,
      category = "otro",
      onProgress,
    }: {
      accountId: string;
      files: File[];
      category?: string;
      onProgress?: (fileName: string, status: "uploading" | "done" | "error") => void;
    }) => {
      if (!effectiveTenantId) throw new Error("No tenant");

      const uploaded: AccountDocument[] = [];
      const failed: { name: string; reason: string }[] = [];

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      for (const file of files) {
        onProgress?.(file.name, "uploading");

        if (file.size > MAX_FILE_BYTES) {
          failed.push({ name: file.name, reason: "supera 50 MB" });
          onProgress?.(file.name, "error");
          continue;
        }

        const unique =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);
        const path = `${effectiveTenantId}/${accountId}/${unique}-${sanitizeFileName(file.name)}`;

        const { error: uploadError } = await supabase.storage
          .from(ACCOUNT_DOCS_BUCKET)
          .upload(path, file, { contentType: file.type || undefined });

        if (uploadError) {
          failed.push({ name: file.name, reason: uploadError.message });
          onProgress?.(file.name, "error");
          continue;
        }

        const { data, error: insertError } = await (supabase as any)
          .from("account_documents")
          .insert({
            tenant_id: effectiveTenantId,
            account_id: accountId,
            file_path: path,
            file_name: file.name,
            file_type: file.type || null,
            file_size: file.size,
            doc_category: category,
            uploaded_by: userId,
          })
          .select()
          .single();

        if (insertError) {
          // No dejar el objeto huérfano en Storage si la fila no se pudo crear.
          await supabase.storage.from(ACCOUNT_DOCS_BUCKET).remove([path]);
          failed.push({ name: file.name, reason: insertError.message });
          onProgress?.(file.name, "error");
          continue;
        }

        uploaded.push(data as AccountDocument);
        onProgress?.(file.name, "done");
      }

      return { uploaded, failed };
    },
    onSuccess: ({ uploaded, failed }, vars) => {
      queryClient.invalidateQueries({ queryKey: ["account-documents", vars.accountId] });
      if (uploaded.length) {
        toast.success(
          uploaded.length === 1
            ? "Documento subido"
            : `${uploaded.length} documentos subidos`
        );
      }
      if (failed.length) {
        toast.error(`No se pudieron subir ${failed.length} archivo(s)`, {
          description: failed.map(f => `${f.name}: ${f.reason}`).join(" · "),
        });
      }
    },
    onError: () => {
      toast.error("Error al subir documentos");
    },
  });
}

export function useDeleteAccountDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (doc: AccountDocument) => {
      // Storage primero: si falla el borrado de la fila, al menos no queda
      // una fila apuntando a un objeto que ya no existe.
      const { error: storageError } = await supabase.storage
        .from(ACCOUNT_DOCS_BUCKET)
        .remove([doc.file_path]);
      if (storageError) throw storageError;

      const { error } = await (supabase as any)
        .from("account_documents")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;

      return doc;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["account-documents", doc.account_id] });
      toast.success("Documento eliminado");
    },
    onError: () => {
      toast.error("Error al eliminar el documento");
    },
  });
}

/**
 * Borra TODOS los archivos de una empresa en Storage.
 *
 * Se llama antes de eliminar la empresa: el FK de account_documents es ON
 * DELETE CASCADE, así que al borrar la empresa las filas desaparecen y con
 * ellas las rutas — si no se limpia antes, los archivos quedan huérfanos en el
 * bucket para siempre, sin forma de encontrarlos.
 *
 * Se lista el prefijo en vez de leer account_documents a propósito: así
 * también se llevan los archivos cuya fila nunca llegó a crearse.
 *
 * Devuelve las rutas que NO se pudieron borrar (vacío si todo salió bien).
 */
export async function removeAccountDocumentFiles(
  tenantId: string,
  accountId: string
): Promise<string[]> {
  const prefix = `${tenantId}/${accountId}`;
  const paths: string[] = [];
  const PAGE = 100;

  // list() pagina de 100 en 100 y no hay tope en la cantidad de documentos
  // por empresa, así que hay que recorrerlo entero.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(ACCOUNT_DOCS_BUCKET)
      .list(prefix, { limit: PAGE, offset });

    if (error) throw error;
    if (!data?.length) break;

    // Las entradas sin id son carpetas o el placeholder de carpeta vacía
    paths.push(...data.filter(o => o.id).map(o => `${prefix}/${o.name}`));

    if (data.length < PAGE) break;
  }

  if (!paths.length) return [];

  const { error } = await supabase.storage.from(ACCOUNT_DOCS_BUCKET).remove(paths);
  return error ? paths : [];
}

/** URL firmada temporal. `download` fuerza descarga en lugar de vista previa. */
export async function getAccountDocumentUrl(
  filePath: string,
  opts: { download?: string; expiresIn?: number } = {}
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ACCOUNT_DOCS_BUCKET)
    .createSignedUrl(filePath, opts.expiresIn ?? 300,
      opts.download ? { download: opts.download } : undefined);

  if (error || !data?.signedUrl) {
    toast.error("No se pudo generar el enlace del documento");
    return null;
  }
  return data.signedUrl;
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
