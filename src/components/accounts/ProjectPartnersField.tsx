import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, ChevronsUpDown, Plus, X, Mail, UserPlus, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import {
  useAccountPartners, useAddProjectPartner, useUpdateProjectPartnerRole,
  useRemoveProjectPartner, useAddPartnerContact, useRemovePartnerContact,
  useContactsByAccount, PARTNER_ROLES, type PartnerRole, type ProjectPartner,
} from "@/hooks/useAccountPartners";

const PARTNER_TYPES = new Set(["partner", "partner_y_cliente"]);

interface Props {
  accountId: string;
  disabled?: boolean;
}

/**
 * Empresas a cargo del proyecto. Se eligen de las Empresas tipo Partner del CRM
 * y sus ejecutivos son los Contactos de esa empresa. Un proyecto puede tener
 * varias (proveedor + tercero que refiere), cada una con su rol.
 */
export function ProjectPartnersField({ accountId, disabled }: Props) {
  const { accounts } = useAccounts();
  const { data: partners = [], isLoading } = useAccountPartners(accountId);
  const addPartner = useAddProjectPartner();

  const [pickerOpen, setPickerOpen] = useState(false);

  // Empresas candidatas: tipo partner, distintas de la actual y no agregadas aún.
  const alreadyAdded = new Set(partners.map((p) => p.partner_account_id));
  const partnerCandidates = useMemo(
    () => accounts.filter(
      (a) => PARTNER_TYPES.has(a.account_type) && a.id !== accountId && !alreadyAdded.has(a.id)
    ),
    [accounts, accountId, partners]
  );

  return (
    <div className="space-y-4">
      {/* Agregar empresa a cargo */}
      {!disabled && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between font-normal">
              <span className="text-muted-foreground">Agregar empresa a cargo…</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar empresa (tipo Partner)…" />
              <CommandList>
                <CommandEmpty>
                  <PartnerEmptyState />
                </CommandEmpty>
                <CommandGroup>
                  {partnerCandidates.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.name}
                      onSelect={() => {
                        addPartner.mutate({ accountId, partnerAccountId: a.id });
                        setPickerOpen(false);
                      }}
                    >
                      <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{a.name}</span>
                      {a.industry && (
                        <span className="ml-2 text-xs text-muted-foreground truncate">{a.industry}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Lista de empresas a cargo */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : partners.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin empresas a cargo. Agrega el proveedor (p.ej. Google Cloud) y, si aplica, el tercero que refirió.
        </p>
      ) : (
        <div className="space-y-3">
          {partners.map((p) => (
            <PartnerCard key={p.id} partner={p} accountId={accountId} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerEmptyState() {
  const navigate = useNavigate();
  return (
    <div className="px-3 py-4 text-center space-y-2">
      <p className="text-sm text-muted-foreground">No hay empresas tipo Partner disponibles.</p>
      <Button type="button" size="sm" variant="secondary" onClick={() => navigate("/accounts/new")}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear empresa Partner
      </Button>
    </div>
  );
}

const ROLE_BADGE: Record<PartnerRole, string> = {
  proveedor: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  referidor: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  otro: "",
};

function PartnerCard({ partner, accountId, disabled }: { partner: ProjectPartner; accountId: string; disabled?: boolean }) {
  const navigate = useNavigate();
  const updateRole = useUpdateProjectPartnerRole();
  const removePartner = useRemoveProjectPartner();
  const addContact = useAddPartnerContact();
  const removeContact = useRemovePartnerContact();
  const { data: partnerContacts = [] } = useContactsByAccount(partner.partner_account_id);
  const [contactOpen, setContactOpen] = useState(false);

  const assignedIds = new Set(partner.contacts.map((c) => c.contact_id));
  const availableContacts = partnerContacts.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header: empresa + rol + eliminar */}
      <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 border-b border-border">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <button
          type="button"
          className="text-sm font-medium truncate hover:underline"
          onClick={() => navigate(`/accounts/${partner.partner_account_id}`)}
        >
          {partner.partner_name}
        </button>
        <Badge variant="outline" className={`ml-1 text-[10px] ${ROLE_BADGE[partner.role]}`}>
          {PARTNER_ROLES.find((r) => r.value === partner.role)?.label}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          {!disabled && (
            <>
              <Select
                value={partner.role}
                onValueChange={(v) => updateRole.mutate({ id: partner.id, accountId, role: v as PartnerRole })}
              >
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTNER_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                type="button" size="icon" variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removePartner.mutate({ id: partner.id, accountId })}
                aria-label={`Quitar ${partner.partner_name}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Contactos asignados */}
      <div className="divide-y divide-border/60">
        {partner.contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-sm font-medium truncate hover:underline"
                  onClick={() => navigate(`/contacts/${c.contact_id}`)}
                >
                  {c.name}
                </button>
                {c.job_title && <span className="text-xs text-muted-foreground truncate">{c.job_title}</span>}
              </div>
              {c.email && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                  <Mail className="h-3 w-3 shrink-0" />{c.email}
                </span>
              )}
            </div>
            {!disabled && (
              <Button
                type="button" size="icon" variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeContact.mutate({ id: c.id, accountId })}
                aria-label={`Quitar a ${c.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {partner.contacts.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Sin ejecutivos asignados de esta empresa.</p>
        )}
      </div>

      {/* Agregar contacto de esta empresa */}
      {!disabled && (
        <div className="px-3 py-2 border-t border-border/60 bg-muted/20">
          <Popover open={contactOpen} onOpenChange={setContactOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Asignar ejecutivo
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar contacto…" />
                <CommandList>
                  <CommandEmpty>
                    <div className="px-3 py-4 text-center space-y-2">
                      <p className="text-sm text-muted-foreground">Esta empresa no tiene contactos.</p>
                      <Button
                        type="button" size="sm" variant="secondary"
                        onClick={() => navigate(`/contacts/new?account_id=${partner.partner_account_id}`)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear contacto
                      </Button>
                    </div>
                  </CommandEmpty>
                  <CommandGroup>
                    {availableContacts.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name} ${c.email ?? ""}`}
                        onSelect={() => {
                          addContact.mutate({ projectPartnerId: partner.id, contactId: c.id, accountId });
                          setContactOpen(false);
                        }}
                      >
                        <Check className="mr-2 h-4 w-4 opacity-0" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{c.name}</p>
                          {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
