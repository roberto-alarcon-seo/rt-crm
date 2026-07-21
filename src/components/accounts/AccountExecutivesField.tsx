import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus, Star, X, Loader2, Mail, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useAccountExecutives, useCreateAccountExecutive,
  useAeOrganizations, useCreateAeOrganization,
  AccountExecutive, LinkedAccountExecutive,
} from "@/hooks/useAccountExecutives";
import { cn } from "@/lib/utils";

interface AccountExecutivesFieldProps {
  /** IDs de los AEs seleccionados. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** ID del AE principal (debe estar dentro de `value`). */
  primaryId?: string | null;
  onPrimaryChange: (id: string | null) => void;
  /**
   * AEs ya vinculados a la empresa. Se usan para pintar los chips sin depender
   * del filtro activo: si el filtro está en Oracle, los AEs de Google que ya
   * estaban asignados deben seguir viéndose.
   */
  linked?: LinkedAccountExecutive[];
  disabled?: boolean;
}

const SIN_ORGANIZACION = "Sin organización";

/**
 * Selector de Account Executives en dos pasos: primero la organización
 * (Google Cloud, Oracle, Salesforce…), luego sus AEs.
 *
 * La organización es un FILTRO de búsqueda, no un candado: una misma empresa
 * puede acumular AEs de varias organizaciones, y los chips se agrupan por
 * organización para que se lea de quién es cada quién.
 */
export function AccountExecutivesField({
  value, onChange, primaryId, onPrimaryChange, linked = [], disabled,
}: AccountExecutivesFieldProps) {
  const { organizations, isLoading: loadingOrgs } = useAeOrganizations();
  const [orgId, setOrgId] = useState<string | null>(null);
  const { executives, isLoading: loadingAEs } = useAccountExecutives(orgId);
  const { executives: allExecutives } = useAccountExecutives();
  const createAE = useCreateAccountExecutive();
  const createOrg = useCreateAeOrganization();

  const [orgOpen, setOrgOpen] = useState(false);
  const [aeOpen, setAeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [orgSearch, setOrgSearch] = useState("");

  const [createAeOpen, setCreateAeOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [aeDraft, setAeDraft] = useState({ name: "", email: "", phone: "", region: "", title: "" });
  const [orgDraft, setOrgDraft] = useState({ name: "", website: "" });

  const selectedOrg = organizations.find(o => o.id === orgId) ?? null;

  /**
   * Los seleccionados se resuelven contra el catálogo completo y, como respaldo,
   * contra los ya vinculados: así un AE recién creado o de otra organización
   * nunca desaparece del chip mientras carga la consulta.
   */
  const selected = useMemo(() => {
    const byId = new Map<string, AccountExecutive>();
    for (const ae of [...linked, ...allExecutives, ...executives]) byId.set(ae.id, ae);
    return value.map(id => byId.get(id)).filter((ae): ae is AccountExecutive => !!ae);
  }, [value, linked, allExecutives, executives]);

  /** Chips agrupados por organización, en orden alfabético. */
  const grouped = useMemo(() => {
    const groups = new Map<string, AccountExecutive[]>();
    for (const ae of selected) {
      const key = ae.organization_name ?? SIN_ORGANIZACION;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ae);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [selected]);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      const next = value.filter(v => v !== id);
      onChange(next);
      // Si se quita el principal, el primero de los que quedan toma el relevo.
      if (primaryId === id) onPrimaryChange(next[0] ?? null);
    } else {
      onChange([...value, id]);
      if (!primaryId) onPrimaryChange(id);
    }
  };

  const openCreateAe = () => {
    setAeDraft({ name: search.trim(), email: "", phone: "", region: "", title: "" });
    setAeOpen(false);
    setCreateAeOpen(true);
  };

  const openCreateOrg = () => {
    setOrgDraft({ name: orgSearch.trim(), website: "" });
    setOrgOpen(false);
    setCreateOrgOpen(true);
  };

  const handleCreateAe = async () => {
    if (!aeDraft.name.trim() || !orgId) return;
    const created = await createAE.mutateAsync({ ...aeDraft, organization_id: orgId });
    onChange([...value, created.id]);
    if (!primaryId) onPrimaryChange(created.id);
    setCreateAeOpen(false);
    setSearch("");
    setAeDraft({ name: "", email: "", phone: "", region: "", title: "" });
  };

  const handleCreateOrg = async () => {
    if (!orgDraft.name.trim()) return;
    const created = await createOrg.mutateAsync(orgDraft);
    setOrgId(created.id);
    setCreateOrgOpen(false);
    setOrgSearch("");
    setOrgDraft({ name: "", website: "" });
  };

  return (
    <div className="space-y-4">
      {/* ── Paso 1: organización · Paso 2: sus AEs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Organización</Label>
          <Popover open={orgOpen} onOpenChange={setOrgOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={orgOpen}
                className="w-full justify-between font-normal"
                disabled={disabled}
              >
                <span className={cn("truncate", !selectedOrg && "text-muted-foreground")}>
                  {selectedOrg?.name ?? "Seleccionar organización…"}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Buscar organización…"
                  value={orgSearch}
                  onValueChange={setOrgSearch}
                />
                <CommandList>
                  {loadingOrgs ? (
                    <div className="py-6 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>
                        <div className="px-3 py-4 text-center space-y-2">
                          <p className="text-sm text-muted-foreground">Sin resultados</p>
                          <Button type="button" size="sm" variant="secondary" onClick={openCreateOrg}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Crear "{orgSearch}"
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {organizations.map(org => (
                          <CommandItem
                            key={org.id}
                            value={org.name}
                            onSelect={() => {
                              setOrgId(org.id);
                              setOrgOpen(false);
                              setSearch("");
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", orgId === org.id ? "opacity-100" : "opacity-0")} />
                            <span className="text-sm truncate">{org.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {organizations.length > 0 && (
                        <CommandGroup>
                          <CommandItem onSelect={openCreateOrg}>
                            <Plus className="mr-2 h-4 w-4" />
                            <span className="text-sm">Crear organización nueva</span>
                          </CommandItem>
                        </CommandGroup>
                      )}
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Account Executives</Label>
          <Popover open={aeOpen} onOpenChange={setAeOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={aeOpen}
                className="w-full justify-between font-normal"
                disabled={disabled || !orgId}
              >
                <span className="text-muted-foreground truncate">
                  {!orgId
                    ? "Elige una organización primero"
                    : `Buscar AE de ${selectedOrg?.name}…`}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Buscar por nombre o email…"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  {loadingAEs ? (
                    <div className="py-6 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>
                        <div className="px-3 py-4 text-center space-y-2">
                          <p className="text-sm text-muted-foreground">
                            {selectedOrg?.name} no tiene AEs que coincidan
                          </p>
                          <Button type="button" size="sm" variant="secondary" onClick={openCreateAe}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            {search.trim() ? `Crear "${search}"` : "Crear AE"}
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {executives.map(ae => (
                          <CommandItem
                            key={ae.id}
                            value={`${ae.name} ${ae.email ?? ""}`}
                            onSelect={() => toggle(ae.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value.includes(ae.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="min-w-0">
                              <p className="text-sm truncate">{ae.name}</p>
                              {ae.email && (
                                <p className="text-xs text-muted-foreground truncate">{ae.email}</p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {executives.length > 0 && (
                        <CommandGroup>
                          <CommandItem onSelect={openCreateAe}>
                            <Plus className="mr-2 h-4 w-4" />
                            <span className="text-sm">Crear Account Executive nuevo</span>
                          </CommandItem>
                        </CommandGroup>
                      )}
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Seleccionados, agrupados por organización ── */}
      {grouped.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin Account Executives asignados. Puedes agregar de más de una organización.
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map(([orgName, aes]) => (
            <div key={orgName} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 border-b border-border">
                <Building className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {orgName}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {aes.length} AE{aes.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {aes.map(ae => {
                  const isPrimary = ae.id === primaryId;
                  return (
                    <div
                      key={ae.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 transition-colors",
                        isPrimary && "bg-primary/5"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{ae.name}</span>
                          {isPrimary && (
                            <Badge variant="outline" className="h-5 gap-1 border-primary/40 text-primary text-[10px]">
                              <Star className="h-2.5 w-2.5 fill-current" /> Principal
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          {ae.title && <span className="shrink-0">{ae.title}</span>}
                          {ae.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 shrink-0" />{ae.email}
                            </span>
                          )}
                          {ae.region && <span className="shrink-0">{ae.region}</span>}
                        </div>
                      </div>

                      {!disabled && (
                        <div className="flex items-center gap-1 shrink-0">
                          {!isPrimary && (
                            <Button
                              type="button" size="sm" variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => onPrimaryChange(ae.id)}
                            >
                              <Star className="h-3 w-3 mr-1" /> Principal
                            </Button>
                          )}
                          <Button
                            type="button" size="icon" variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => toggle(ae.id)}
                            aria-label={`Quitar a ${ae.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Alta de AE ── */}
      <Dialog open={createAeOpen} onOpenChange={setCreateAeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Nuevo Account Executive{selectedOrg ? ` · ${selectedOrg.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ae-name">Nombre *</Label>
              <Input
                id="ae-name"
                placeholder="Nombre completo"
                value={aeDraft.name}
                onChange={e => setAeDraft(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ae-email">Email</Label>
                <Input
                  id="ae-email"
                  type="email"
                  placeholder="ae@empresa.com"
                  value={aeDraft.email}
                  onChange={e => setAeDraft(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ae-title">Puesto</Label>
                <Input
                  id="ae-title"
                  placeholder="Enterprise AE"
                  value={aeDraft.title}
                  onChange={e => setAeDraft(p => ({ ...p, title: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ae-phone">Teléfono</Label>
                <Input
                  id="ae-phone"
                  placeholder="+52 55 …"
                  value={aeDraft.phone}
                  onChange={e => setAeDraft(p => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ae-region">Región</Label>
                <Input
                  id="ae-region"
                  placeholder="LATAM Norte"
                  value={aeDraft.region}
                  onChange={e => setAeDraft(p => ({ ...p, region: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateAeOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateAe}
              disabled={!aeDraft.name.trim() || !orgId || createAE.isPending}
            >
              {createAE.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear y asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Alta de organización ── */}
      <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva organización</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Nombre *</Label>
              <Input
                id="org-name"
                placeholder="Ej. Salesforce"
                value={orgDraft.name}
                onChange={e => setOrgDraft(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-website">Sitio web</Label>
              <Input
                id="org-website"
                placeholder="https://salesforce.com"
                value={orgDraft.website}
                onChange={e => setOrgDraft(p => ({ ...p, website: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOrgOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateOrg}
              disabled={!orgDraft.name.trim() || createOrg.isPending}
            >
              {createOrg.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear organización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
