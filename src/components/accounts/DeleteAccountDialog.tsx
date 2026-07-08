import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccountContactCount, useDeleteAccount } from "@/hooks/useAccounts";
import { toast } from "sonner";

interface DeleteAccountDialogProps {
  accountId: string;
  accountName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete (e.g. navigate away or refresh). */
  onDeleted?: () => void;
}

export function DeleteAccountDialog({
  accountId,
  accountName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteAccountDialogProps) {
  const { count, isLoading: loadingCount } = useAccountContactCount(accountId, open);
  const deleteAccount = useDeleteAccount();
  const [confirmed, setConfirmed] = useState(false);

  const hasContacts = count > 0;

  // Reset the confirmation checkbox whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open, accountId]);

  const canDelete = !loadingCount && (!hasContacts || confirmed) && !deleteAccount.isPending;

  const handleDelete = async () => {
    try {
      const result = await deleteAccount.mutateAsync(accountId);
      const n = result?.deleted_contacts ?? 0;
      toast.success(
        n > 0
          ? `Empresa eliminada junto con ${n} contacto${n === 1 ? "" : "s"} y sus datos`
          : "Empresa eliminada",
      );
      onOpenChange(false);
      onDeleted?.();
    } catch {
      // error toast handled by the mutation hook
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Eliminar empresa
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Vas a eliminar <span className="font-semibold text-foreground">{accountName}</span>.
                Esta acción no se puede deshacer.
              </p>

              {loadingCount ? (
                <span className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Revisando datos vinculados…
                </span>
              ) : hasContacts ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
                  Esta empresa tiene{" "}
                  <span className="font-semibold">
                    {count} contacto{count === 1 ? "" : "s"}
                  </span>
                  . Al eliminarla se borrarán también{" "}
                  <span className="font-semibold">todos sus contactos y datos relacionados</span>{" "}
                  (conversaciones, oportunidades, notas, seguimientos y atribución).
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tiene contactos vinculados.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasContacts && !loadingCount && (
          <label className="flex items-start gap-2 rounded-md border border-border/60 p-3 cursor-pointer">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              Entiendo que se eliminarán {count} contacto{count === 1 ? "" : "s"} y todos sus
              datos de forma permanente.
            </span>
          </label>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteAccount.isPending}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canDelete}
            onClick={handleDelete}
          >
            {deleteAccount.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminando…
              </>
            ) : (
              "Eliminar empresa"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
