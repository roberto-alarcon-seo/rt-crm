import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Property } from "@/hooks/useProperties";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { useTenantContext } from "@/hooks/useTenantContext";
import PropertyAuthorizedAgents from "./PropertyAuthorizedAgents";
import PropertyPortalIdsEditor from "./PropertyPortalIdsEditor";

interface PropertyInfoTabProps {
  formData: Partial<Property>;
  updateField: <K extends keyof Property>(field: K, value: Property[K]) => void;
  propertyId?: string;
}

const OPERATION_TYPES = [
  { value: "sale", label: "Venta" },
  { value: "rent", label: "Renta" },
];

const STATUS_OPTIONS = [
  { value: "available", label: "Disponible" },
  { value: "reserved", label: "Apartado" },
  { value: "sold", label: "Vendido" },
  { value: "rented", label: "Rentado" },
  { value: "inactive", label: "Inactiva" },
];

const CURRENCY_OPTIONS = [
  { value: "MXN", label: "MXN" },
  { value: "USD", label: "USD" },
  { value: "COP", label: "COP" },
  { value: "ARS", label: "ARS" },
  { value: "CLP", label: "CLP" },
  { value: "PEN", label: "PEN" },
  { value: "EUR", label: "EUR" },
];

const CREDIT_OPTIONS_BY_COUNTRY: Record<string, { value: string; label: string }[]> = {
  MX: [
    { value: "INFONAVIT", label: "INFONAVIT" },
    { value: "COFINAVIT", label: "COFINAVIT" },
    { value: "FOVISSSTE", label: "FOVISSSTE" },
    { value: "ISFAM", label: "ISFAM" },
    { value: "CFE", label: "CFE" },
    { value: "BANK", label: "Bancario" },
    { value: "CONTADO", label: "Contado" },
  ],
  CO: [
    { value: "FNA", label: "FNA" },
    { value: "SUBSIDIO_MIVIVIENDA", label: "Subsidio Mi Casa Ya" },
    { value: "LEASING", label: "Leasing habitacional" },
    { value: "BANK", label: "Bancario" },
    { value: "CONTADO", label: "Contado" },
  ],
  AR: [
    { value: "PROCREAR", label: "Procrear" },
    { value: "BANK", label: "Bancario" },
    { value: "CONTADO", label: "Contado" },
  ],
  CL: [
    { value: "SUBSIDIO_DS1", label: "Subsidio DS1" },
    { value: "BANK", label: "Bancario" },
    { value: "CONTADO", label: "Contado" },
  ],
  PE: [
    { value: "MIVIVIENDA", label: "MiVivienda" },
    { value: "TECHO_PROPIO", label: "Techo Propio" },
    { value: "BANK", label: "Bancario" },
    { value: "CONTADO", label: "Contado" },
  ],
  ES: [
    { value: "HIPOTECA", label: "Hipoteca" },
    { value: "BANK", label: "Bancario" },
    { value: "CONTADO", label: "Contado" },
  ],
};

const DEFAULT_CREDIT_OPTIONS = [
  { value: "BANK", label: "Bancario" },
  { value: "CONTADO", label: "Contado" },
];

export default function PropertyInfoTab({
  formData,
  updateField,
  propertyId,
}: PropertyInfoTabProps) {
  const tenantId = useEffectiveTenantId();
  const { data: tenantCtx } = useTenantContext();
  const isExternallyManaged = !!tenantCtx?.managed_externally;
  const countryCode = tenantCtx?.country_code ?? "MX";
  const creditOptionsForCountry =
    CREDIT_OPTIONS_BY_COUNTRY[countryCode] ?? DEFAULT_CREDIT_OPTIONS;

  const knownValues = new Set(creditOptionsForCountry.map((c) => c.value));
  const extraSelectedCredits = (formData.accepted_credits ?? [])
    .filter((c) => !knownValues.has(c))
    .map((value) => ({ value, label: value }));
  const renderedCreditOptions = [...creditOptionsForCountry, ...extraSelectedCredits];

  const { data: asesores } = useQuery({
    queryKey: ["tenant-asesores", tenantId],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!tenantId) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (profilesError) throw profilesError;
      const allProfiles = profiles ?? [];
      if (allProfiles.length === 0) return [];
      const ids = allProfiles.map((p: any) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, tenant_role")
        .in("user_id", ids);
      const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.tenant_role]));
      return allProfiles.filter((p: any) => roleMap.get(p.id) === "asesor");
    },
    enabled: !!tenantId,
  });

  const handleCreditToggle = (credit: string) => {
    if (isExternallyManaged) return;
    const current = formData.accepted_credits || [];
    const updated = current.includes(credit)
      ? current.filter((c) => c !== credit)
      : [...current, credit];
    updateField("accepted_credits", updated);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {isExternallyManaged && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            <span>
              Esta propiedad es gestionada por el <strong>Sistema Core</strong>.
              Los campos técnicos y créditos son de solo lectura.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left column: 4 focused cards ── */}
          <div className="space-y-4">

            {/* Card 1: Identificación */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Identificación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="property_code">ID de la propiedad *</Label>
                    <Input
                      id="property_code"
                      value={formData.property_code || ""}
                      onChange={(e) => updateField("property_code", e.target.value)}
                      placeholder="PROP-001"
                      disabled={isExternallyManaged}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assigned_user">Asesor asignado</Label>
                    <Select
                      value={formData.assigned_user_id || "none"}
                      onValueChange={(v) =>
                        updateField("assigned_user_id", v === "none" ? null : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {asesores?.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Nombre de la propiedad *</Label>
                  <Input
                    id="title"
                    value={formData.title || ""}
                    onChange={(e) => updateField("title", e.target.value)}
                    placeholder="Penthouse en Condesa"
                    disabled={isExternallyManaged}
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    id="is_active"
                    checked={formData.is_active ?? true}
                    onCheckedChange={(v) => updateField("is_active", v)}
                    disabled={isExternallyManaged}
                  />
                  <Label htmlFor="is_active">Propiedad activa</Label>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Operación y precio */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Operación y precio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="operation_type">Tipo de operación *</Label>
                    <Select
                      value={formData.operation_type || "sale"}
                      onValueChange={(v) => updateField("operation_type", v)}
                      disabled={isExternallyManaged}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATION_TYPES.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="property_type">Tipo de propiedad</Label>
                    <Input
                      id="property_type"
                      value={formData.property_type || ""}
                      onChange={(e) =>
                        updateField("property_type", e.target.value || null)
                      }
                      placeholder="Departamento, Casa, Terreno…"
                      disabled={isExternallyManaged}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="price">Precio</Label>
                    <Input
                      id="price"
                      type="number"
                      value={formData.price || 0}
                      onChange={(e) => updateField("price", Number(e.target.value))}
                      disabled={isExternallyManaged}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Moneda</Label>
                    <Select
                      value={formData.currency || "MXN"}
                      onValueChange={(v) => updateField("currency", v)}
                      disabled={isExternallyManaged}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Estatus</Label>
                    <Select
                      value={formData.status || "available"}
                      onValueChange={(v) => updateField("status", v)}
                      disabled={isExternallyManaged}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maintenance_fee">
                      Mantenimiento ({formData.currency || "MXN"})
                    </Label>
                    <Input
                      id="maintenance_fee"
                      type="number"
                      value={formData.maintenance_fee || ""}
                      onChange={(e) =>
                        updateField(
                          "maintenance_fee",
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      placeholder="0"
                      disabled={isExternallyManaged}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Ubicación */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ubicación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="zone">Zona *</Label>
                    <Input
                      id="zone"
                      value={formData.zone || ""}
                      onChange={(e) => updateField("zone", e.target.value)}
                      placeholder="Condesa, CDMX"
                      disabled={isExternallyManaged}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Input
                      id="address"
                      value={formData.address || ""}
                      onChange={(e) => updateField("address", e.target.value)}
                      placeholder="Calle, Número"
                      disabled={isExternallyManaged}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location_url">Ubicación (Google Maps)</Label>
                  <Input
                    id="location_url"
                    type="url"
                    value={formData.location_url || ""}
                    onChange={(e) => updateField("location_url", e.target.value)}
                    placeholder="https://maps.google.com/?q=..."
                    disabled={isExternallyManaged}
                    className={cn(
                      formData.location_url &&
                        !/^https?:\/\//i.test(formData.location_url) &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {formData.location_url && !/^https?:\/\//i.test(formData.location_url) ? (
                    <p className="text-xs text-destructive">
                      Debe ser una URL válida que empiece con https://
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Se compartirá con el lead cuando solicite la ubicación.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website_url">Página web de la propiedad</Label>
                  <Input
                    id="website_url"
                    type="url"
                    value={formData.website_url || ""}
                    onChange={(e) => updateField("website_url", e.target.value)}
                    placeholder="https://www.miinmobiliaria.com/propiedad/..."
                    disabled={isExternallyManaged}
                    className={cn(
                      formData.website_url &&
                        !/^https?:\/\//i.test(formData.website_url) &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {formData.website_url && !/^https?:\/\//i.test(formData.website_url) ? (
                    <p className="text-xs text-destructive">
                      Debe ser una URL válida que empiece con https://
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sitio web del cliente con información detallada de esta propiedad.
                    </p>
                  )}
                </div>

              </CardContent>
            </Card>

            {/* Card 4: Características técnicas */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Características técnicas</CardTitle>
                  {isExternallyManaged && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" /> Solo lectura
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        Estos valores son controlados por el Sistema Core
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="construction_year">Año de construcción</Label>
                  <Input
                    id="construction_year"
                    type="number"
                    min={1800}
                    max={new Date().getFullYear() + 5}
                    value={formData.construction_year ?? ""}
                    onChange={(e) =>
                      updateField(
                        "construction_year",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    placeholder={`Ej. ${new Date().getFullYear() - 10}`}
                    disabled={isExternallyManaged}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bedrooms">Recámaras</Label>
                    <Input
                      id="bedrooms"
                      type="number"
                      min={0}
                      value={formData.bedrooms ?? ""}
                      onChange={(e) =>
                        updateField(
                          "bedrooms",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      placeholder="0"
                      disabled={isExternallyManaged}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bathrooms">Baños</Label>
                    <Input
                      id="bathrooms"
                      type="number"
                      min={0}
                      step="0.5"
                      value={formData.bathrooms ?? ""}
                      onChange={(e) =>
                        updateField(
                          "bathrooms",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      placeholder="0"
                      disabled={isExternallyManaged}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parking_spots">Estacionamientos</Label>
                    <Input
                      id="parking_spots"
                      type="number"
                      min={0}
                      value={formData.parking_spots ?? ""}
                      onChange={(e) =>
                        updateField(
                          "parking_spots",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      placeholder="0"
                      disabled={isExternallyManaged}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sq_meters">Metros cuadrados</Label>
                    <Input
                      id="sq_meters"
                      type="number"
                      min={0}
                      value={formData.sq_meters ?? ""}
                      onChange={(e) =>
                        updateField(
                          "sq_meters",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      placeholder="0"
                      disabled={isExternallyManaged}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column: description → AI guide → internal notes ── */}
          <div className="space-y-4">

            {/* Card R1: Descripción comercial */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Descripción comercial</CardTitle>
                <CardDescription>
                  Texto que verá el cliente: portales, fichas, sitio web. La IA también lo incluye en su contexto al responder.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Amplio departamento con vista al parque, acabados premium, excelente iluminación natural…"
                  className="min-h-[300px]"
                  disabled={isExternallyManaged}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Créditos aceptados</Label>
                    <span className="text-xs text-muted-foreground">Región: {countryCode}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {renderedCreditOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleCreditToggle(opt.value)}
                        disabled={isExternallyManaged}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          formData.accepted_credits?.includes(opt.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted border-border hover:border-primary/50"
                        } ${isExternallyManaged ? "opacity-70 cursor-not-allowed hover:border-border" : ""}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {renderedCreditOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No hay opciones configuradas para la región {countryCode}.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card R2: Instrucciones para el asistente */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Instrucciones para el asistente IA</CardTitle>
                <CardDescription>
                  Contexto operativo que el bot siempre tiene presente: condiciones de venta, restricciones, qué no debe decir y cómo manejar objeciones.
                  Para preguntas específicas con respuesta exacta (¿tiene barda?, ¿acepta mascotas?) usa la pestaña <strong>Preguntas frecuentes</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  id="ai_prompt"
                  value={formData.ai_description_template || formData.ai_prompt || ""}
                  onChange={(e) => updateField("ai_prompt", e.target.value)}
                  placeholder={"Ej:\n- Acepta INFONAVIT, FOVISSSTE y crédito bancario.\n- Visitas solo sábados y domingos, previa cita con el asesor.\n- Precio negociable a partir de 2.8 M si es oferta en firme.\n- No confirmar precio final por chat, derivar al asesor.\n- Si preguntan por la bodega, indicar que está en remodelación."}
                  className="min-h-[140px]"
                  disabled={isExternallyManaged}
                />
                {isExternallyManaged && formData.ai_description_template && (
                  <p className="text-xs text-muted-foreground">
                    Plantilla enviada por el Sistema Core.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Card R3: Notas internas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notas internas</CardTitle>
                <CardDescription>
                  Comentarios del equipo. No se comparten con el cliente ni con la IA.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  id="internal_notes"
                  value={formData.internal_notes || ""}
                  onChange={(e) => updateField("internal_notes", e.target.value)}
                  placeholder="Ej: Dueño es flex en precio si es venta rápida. Contactar a Juan antes de agendar visita."
                  className="min-h-[100px]"
                  disabled={isExternallyManaged}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {propertyId && (
          <PropertyPortalIdsEditor propertyId={propertyId} />
        )}

        {propertyId && (
          <PropertyAuthorizedAgents propertyId={propertyId} />
        )}
      </div>
    </TooltipProvider>
  );
}
