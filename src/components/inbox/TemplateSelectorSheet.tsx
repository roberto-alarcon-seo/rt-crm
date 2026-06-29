import { useState, useMemo } from "react";
import {
  Search, FileText, Image, Video, File, Clock, Loader2,
  AlertTriangle, Send, ArrowLeft, Home, MapPin, ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTemplates, Template } from "@/hooks/useTemplates";
import { useProperties, Property } from "@/hooks/useProperties";
import { isOutOfWindow } from "@/hooks/useSendMessage";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  country?: string;
}

interface TemplateSelectorSheetProps {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
  lastCustomerMessageAt: string | null;
  onSendTemplate: (templateId: string, variables: Record<string, string>) => void;
  isSending?: boolean;
}

type View = "list" | "property" | "variables";

// Variables that trigger the property selector step
const PROPERTY_VAR_KEYS = new Set([
  "inmueble", "direccion", "url_maps", "precio", "zona", "tipo_inmueble",
]);

function templateHasPropertyVars(template: Template): boolean {
  return template.variables.some((v) => PROPERTY_VAR_KEYS.has(v.toLowerCase()));
}

export function TemplateSelectorSheet({
  open,
  onClose,
  contact,
  lastCustomerMessageAt,
  onSendTemplate,
  isSending = false,
}: TemplateSelectorSheetProps) {
  const { profile } = useAuth();
  const { data: tenantCtx } = useTenantContext();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: properties, isLoading: propertiesLoading } = useProperties({ status: "available" });

  // Fetch contact's current property of interest so we can pre-select it
  const { data: contactInterestId } = useQuery({
    queryKey: ["contact-interest-property", contact?.id],
    queryFn: async () => {
      if (!contact?.id) return null;
      const { data } = await supabase
        .from("contacts")
        .select("re_property_interest_id")
        .eq("id", contact.id)
        .maybeSingle();
      return data?.re_property_interest_id ?? null;
    },
    enabled: !!contact?.id,
  });

  const [view, setView] = useState<View>("list");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [templateSearch, setTemplateSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [propertySearch, setPropertySearch] = useState("");

  // ── Auto-fill logic ──────────────────────────────────────────────────────
  const buildVariableValues = (
    template: Template,
    property: Property | null,
  ): Record<string, string> => {
    const values: Record<string, string> = {};

    for (const variable of template.variables) {
      const key = variable.toLowerCase();

      // Contact
      if (key === "nombre" || key === "name")
        values[variable] = contact?.name ?? "";
      else if (key === "email" || key === "correo")
        values[variable] = contact?.email ?? "";
      else if (key === "telefono" || key === "phone")
        values[variable] = contact?.phone ?? "";
      else if (key === "pais" || key === "country")
        values[variable] = contact?.country ?? "";

      // Agent & tenant (always auto)
      else if (key === "asesor" || key === "agente" || key === "agent")
        values[variable] = profile?.name ?? "";
      else if (key === "empresa" || key === "company" || key === "inmobiliaria")
        values[variable] = tenantCtx?.name ?? "";

      // Property — filled when a property is selected
      else if (key === "inmueble")
        values[variable] = property?.title ?? "";
      else if (key === "direccion")
        values[variable] = property?.address ?? "";
      else if (key === "url_maps")
        values[variable] = property?.location_url ?? "";
      else if (key === "precio") {
        if (property) {
          const formatted = property.price.toLocaleString("es-MX");
          values[variable] = `${property.currency} $${formatted}`;
        } else {
          values[variable] = "";
        }
      } else if (key === "zona")
        values[variable] = property?.zone ?? "";
      else if (key === "tipo_inmueble")
        values[variable] = property?.property_type ?? "";

      else values[variable] = "";
    }

    return values;
  };

  // ── Template list ────────────────────────────────────────────────────────
  const approvedTemplates = useMemo(
    () => (templates ?? []).filter((t) => t.approval_status === "approved"),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    return approvedTemplates.filter((t) => {
      const matchesSearch =
        !templateSearch ||
        t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.body.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.label?.toLowerCase().includes(templateSearch.toLowerCase());
      const matchesCategory = !categoryFilter || t.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [approvedTemplates, templateSearch, categoryFilter]);

  const categories = useMemo(
    () => Array.from(new Set(approvedTemplates.map((t) => t.category))),
    [approvedTemplates],
  );

  // ── Property list ────────────────────────────────────────────────────────
  const filteredProperties = useMemo(() => {
    const list = properties ?? [];
    if (!propertySearch) return list;
    const q = propertySearch.toLowerCase();
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.property_code.toLowerCase().includes(q) ||
        p.zone.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q),
    );
  }, [properties, propertySearch]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    if (templateHasPropertyVars(template)) {
      // Pre-select the contact's property of interest if it exists in the list
      const preSelected =
        properties?.find((p) => p.id === contactInterestId) ?? null;
      setSelectedProperty(preSelected);
      setView("property");
    } else {
      setVariableValues(buildVariableValues(template, null));
      setView("variables");
    }
  };

  const handleConfirmProperty = (property: Property | null) => {
    setSelectedProperty(property);
    setVariableValues(buildVariableValues(selectedTemplate!, property));
    setView("variables");
  };

  const handleBack = () => {
    if (view === "variables" && selectedTemplate && templateHasPropertyVars(selectedTemplate)) {
      setView("property");
    } else if (view === "variables" || view === "property") {
      setView("list");
      setSelectedTemplate(null);
      setSelectedProperty(null);
    }
  };

  const handleClose = () => {
    setView("list");
    setSelectedTemplate(null);
    setSelectedProperty(null);
    setVariableValues({});
    setTemplateSearch("");
    setPropertySearch("");
    setCategoryFilter(null);
    onClose();
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const allVariablesFilled = useMemo(() => {
    if (!selectedTemplate) return true;
    return selectedTemplate.variables.every((v) => variableValues[v]?.trim());
  }, [selectedTemplate, variableValues]);

  const previewBody = useMemo(() => {
    if (!selectedTemplate) return "";
    let body = selectedTemplate.body;
    Object.entries(variableValues).forEach(([key, value]) => {
      body = body.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        value || `{{${key}}}`,
      );
    });
    return body;
  }, [selectedTemplate, variableValues]);

  const outOfWindow = isOutOfWindow(lastCustomerMessageAt);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getCategoryLabel = (cat: string) =>
    ({ marketing: "Marketing", utility: "Utilidad", authentication: "Autenticación" }[cat] ?? cat);

  const getMediaIcon = (headerType: string) => {
    if (headerType === "image") return <Image className="h-4 w-4" />;
    if (headerType === "video") return <Video className="h-4 w-4" />;
    if (headerType === "document") return <File className="h-4 w-4" />;
    return null;
  };

  const formatPrice = (p: Property) =>
    `${p.currency} $${p.price.toLocaleString("es-MX")}`;

  const stepTitle: Record<View, string> = {
    list: "Seleccionar plantilla",
    property: "Seleccionar inmueble",
    variables: "Completar variables",
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="right" className="w-full sm:w-[540px] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {view !== "list" && (
              <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <SheetTitle className="flex-1">{stepTitle[view]}</SheetTitle>

            {/* Step indicator */}
            {selectedTemplate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {templateHasPropertyVars(selectedTemplate) ? (
                  <>
                    <span className={cn("font-medium", view === "list" && "text-primary")}>Plantilla</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className={cn("font-medium", view === "property" && "text-primary")}>Inmueble</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className={cn("font-medium", view === "variables" && "text-primary")}>Variables</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-muted-foreground">Plantilla</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="font-medium text-primary">Variables</span>
                  </>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        {/* ── STEP 1: Template List ────────────────────────────────────────── */}
        {view === "list" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-4 space-y-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar plantilla..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={categoryFilter === null ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setCategoryFilter(null)}
                  >
                    Todas
                  </Badge>
                  {categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant={categoryFilter === cat ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setCategoryFilter(cat)}
                    >
                      {getCategoryLabel(cat)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {outOfWindow && (
              <div className="px-4 py-2 bg-warning/10 border-b border-warning/20">
                <div className="flex items-center gap-2 text-sm text-warning">
                  <Clock className="h-4 w-4" />
                  <span>Fuera de ventana 24h — Solo plantillas disponibles</span>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No hay plantillas aprobadas</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Crea y aprueba plantillas en Configuración → Librería de Plantillas
                  </p>
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="p-4 rounded-lg border border-border cursor-pointer transition-colors hover:bg-muted/50 hover:border-primary/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-foreground truncate">{template.name}</h4>
                            {getMediaIcon(template.header_type)}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{template.body}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {getCategoryLabel(template.category)}
                            </Badge>
                            {template.label && (
                              <Badge variant="outline" className="text-xs">{template.label}</Badge>
                            )}
                            {templateHasPropertyVars(template) && (
                              <Badge variant="outline" className="text-xs gap-1 text-primary border-primary/30">
                                <Home className="h-3 w-3" />
                                Inmueble
                              </Badge>
                            )}
                            {template.variables.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {template.variables.length} variable{template.variables.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* ── STEP 2: Property Selector ────────────────────────────────────── */}
        {view === "property" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Selected template chip */}
            {selectedTemplate && (
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Plantilla: <span className="font-medium text-foreground">{selectedTemplate.name}</span>
                </p>
              </div>
            )}

            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, clave, zona..."
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {propertiesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {/* Skip option */}
                  <div
                    onClick={() => handleConfirmProperty(null)}
                    className="p-3 rounded-lg border border-dashed border-border cursor-pointer transition-colors hover:bg-muted/50 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Sin inmueble</p>
                      <p className="text-xs text-muted-foreground">Completar las variables manualmente</p>
                    </div>
                  </div>

                  {filteredProperties.length === 0 && !propertiesLoading && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No hay inmuebles disponibles
                    </p>
                  )}

                  {filteredProperties.map((property) => {
                    const isPreSelected = property.id === contactInterestId;
                    const isSelected = selectedProperty?.id === property.id;

                    return (
                      <div
                        key={property.id}
                        onClick={() => handleConfirmProperty(property)}
                        className={cn(
                          "p-4 rounded-lg border cursor-pointer transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50 hover:border-primary/30",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Cover image or placeholder */}
                          <div className="w-14 h-14 rounded-md bg-muted shrink-0 overflow-hidden">
                            {property.cover_image ? (
                              <img
                                src={property.cover_image}
                                alt={property.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Home className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-foreground truncate">
                                {property.title}
                              </span>
                              {isPreSelected && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  Interés del lead
                                </Badge>
                              )}
                            </div>

                            <p className="text-xs text-muted-foreground mt-0.5">
                              {property.property_code} · {property.zone}
                            </p>

                            {property.address && (
                              <div className="flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-xs text-muted-foreground truncate">
                                  {property.address}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs font-medium text-foreground">
                                {formatPrice(property)}
                              </span>
                              {property.location_url && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <MapPin className="h-3 w-3" />
                                  Maps
                                </Badge>
                              )}
                              {!property.location_url && (
                                <span className="text-xs text-muted-foreground/60">Sin link Maps</span>
                              )}
                            </div>
                          </div>

                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* ── STEP 3: Variable Editor ──────────────────────────────────────── */}
        {view === "variables" && selectedTemplate && (
          <div className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                {/* Summary chips */}
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="font-medium text-sm text-foreground">{selectedTemplate.name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {getCategoryLabel(selectedTemplate.category)}
                    </Badge>
                    {selectedProperty && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Home className="h-3 w-3" />
                        {selectedProperty.title}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Variable inputs */}
                {selectedTemplate.variables.length > 0 && (
                  <div className="space-y-4">
                    <h5 className="font-medium text-sm text-foreground">Variables</h5>
                    {selectedTemplate.variables.map((variable) => {
                      const isAutoFilled =
                        ["nombre","name","email","correo","telefono","phone","pais","country",
                         "asesor","agente","agent","empresa","company","inmobiliaria"].includes(variable.toLowerCase()) ||
                        (PROPERTY_VAR_KEYS.has(variable.toLowerCase()) && !!selectedProperty);

                      return (
                        <div key={variable} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`var-${variable}`} className="text-sm">
                              {variable} <span className="text-destructive">*</span>
                            </Label>
                            {isAutoFilled && (
                              <span className="text-xs text-primary">Auto-rellenado</span>
                            )}
                          </div>
                          <Input
                            id={`var-${variable}`}
                            value={variableValues[variable] ?? ""}
                            onChange={(e) =>
                              setVariableValues((prev) => ({
                                ...prev,
                                [variable]: e.target.value,
                              }))
                            }
                            placeholder={`Valor para {{${variable}}}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Preview */}
                <div className="space-y-2">
                  <h5 className="font-medium text-sm text-foreground">Vista previa</h5>
                  <div className="p-4 rounded-lg bg-message-outgoing text-white space-y-2">
                    {selectedTemplate.header_type === "image" && selectedTemplate.media_url && (
                      <img
                        src={selectedTemplate.media_url}
                        alt="Header"
                        className="max-w-full rounded-lg"
                      />
                    )}
                    {selectedTemplate.header_type === "video" && (
                      <div className="aspect-video bg-background/50 rounded-lg flex items-center justify-center">
                        <Video className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {selectedTemplate.header_type === "document" && (
                      <div className="flex items-center gap-2 p-3 bg-background/50 rounded-lg">
                        <File className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm truncate">
                          {selectedTemplate.media_filename || "Documento"}
                        </span>
                      </div>
                    )}
                    {selectedTemplate.header_type === "text" && selectedTemplate.header_text && (
                      <p className="font-semibold text-white">{selectedTemplate.header_text}</p>
                    )}
                    <p className="text-sm text-white whitespace-pre-line">{previewBody}</p>
                    {selectedTemplate.footer && (
                      <p className="text-xs text-white/70">{selectedTemplate.footer}</p>
                    )}
                  </div>
                </div>

                {!allVariablesFilled && (
                  <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 p-3 rounded-lg">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Completa todas las variables para enviar</span>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border">
              <Button
                className="w-full"
                onClick={() => onSendTemplate(selectedTemplate.id, variableValues)}
                disabled={!allVariablesFilled || isSending}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar plantilla
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
