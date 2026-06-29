import { useState } from "react";
import { Plus, Trash2, ExternalLink, Link } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePropertyPortalIds, usePropertyPortalIdMutations } from "@/hooks/usePropertyPortalIds";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";

const PORTAL_SUGGESTIONS = [
  "Fincaraiz",
  "Metrocuadrado",
  "Inmuebles24",
  "Lamudi",
  "Casas y Terrenos",
  "Vivaanuncios",
  "MercadoLibre",
  "Portal Inmobiliario",
];

interface Props {
  propertyId: string;
}

export default function PropertyPortalIdsEditor({ propertyId }: Props) {
  const tenantId = useEffectiveTenantId();
  const { data: portalIds = [], isLoading } = usePropertyPortalIds(propertyId);
  const { add, remove } = usePropertyPortalIdMutations(propertyId);

  const [open, setOpen] = useState(false);
  const [portalId, setPortalId] = useState("");
  const [portalName, setPortalName] = useState("");
  const [portalUrl, setPortalUrl] = useState("");

  const handleAdd = async () => {
    if (!portalId.trim() || !tenantId) return;
    await add.mutateAsync({
      tenant_id: tenantId,
      portal_id: portalId.trim(),
      portal_name: portalName.trim() || null,
      portal_url: portalUrl.trim() || null,
    });
    setPortalId("");
    setPortalName("");
    setPortalUrl("");
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">IDs de portales</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              IDs con los que aparece esta propiedad en portales externos. La IA
              los usará para identificar la propiedad cuando el lead los mencione.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Agregar ID de portal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="portal_id">
                    ID del portal <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="portal_id"
                    value={portalId}
                    onChange={(e) => setPortalId(e.target.value)}
                    placeholder="193857552"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    El número o código que identifica la publicación en el portal.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portal_name">Portal</Label>
                  <Input
                    id="portal_name"
                    value={portalName}
                    onChange={(e) => setPortalName(e.target.value)}
                    placeholder="Ej. Fincaraiz, Metrocuadrado…"
                    list="portal-suggestions"
                  />
                  <datalist id="portal-suggestions">
                    {PORTAL_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portal_url">URL de la publicación (opcional)</Label>
                  <Input
                    id="portal_url"
                    value={portalUrl}
                    onChange={(e) => setPortalUrl(e.target.value)}
                    placeholder="https://www.fincaraiz.com.co/…"
                    type="url"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={!portalId.trim() || add.isPending}
                >
                  Agregar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : portalIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin IDs de portales registrados.
          </p>
        ) : (
          <div className="space-y-2">
            {portalIds.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono font-medium">{entry.portal_id}</span>
                  {entry.portal_name && (
                    <Badge variant="secondary" className="text-xs">
                      {entry.portal_name}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {entry.portal_url && (
                    <a
                      href={entry.portal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
