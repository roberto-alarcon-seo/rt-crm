import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Plus, Search, Users, Loader2, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAccounts, useAccountContactCounts } from "@/hooks/useAccounts";
import { AccountDetailPanel } from "@/components/accounts/AccountDetailPanel";
import { cn } from "@/lib/utils";

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  prospect: { label: "Prospecto", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  cliente: { label: "Cliente", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  partner: { label: "Partner", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  partner_y_cliente: { label: "Cliente & Partner", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const COUNTRY_LABELS: Record<string, string> = {
  MX: "🇲🇽 México", CO: "🇨🇴 Colombia", CL: "🇨🇱 Chile",
  AR: "🇦🇷 Argentina", PE: "🇵🇪 Perú", US: "🇺🇸 Estados Unidos",
};

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function Accounts() {
  const navigate = useNavigate();
  const { id: selectedId } = useParams<{ id: string }>();
  const { accounts, isLoading } = useAccounts();
  const contactCounts = useAccountContactCounts();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "contacts">("name");

  const filtered = useMemo(() => {
    const list = accounts.filter(a => {
      const matchSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.industry?.toLowerCase().includes(search.toLowerCase()) ||
        a.city?.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || a.account_type === typeFilter;
      const matchCountry = countryFilter === "all" || a.country === countryFilter;
      return matchSearch && matchType && matchCountry;
    });
    return list.sort((a, b) =>
      sort === "contacts"
        ? (contactCounts[b.id] || 0) - (contactCounts[a.id] || 0) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  }, [accounts, search, typeFilter, countryFilter, sort, contactCounts]);

  const counts = useMemo(() => ({
    total: accounts.length,
    withContacts: accounts.filter(a => (contactCounts[a.id] || 0) > 0).length,
    clientes: accounts.filter(a => a.account_type === "cliente" || a.account_type === "partner_y_cliente").length,
    partners: accounts.filter(a => a.account_type === "partner" || a.account_type === "partner_y_cliente").length,
  }), [accounts, contactCounts]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top bar */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground leading-tight">Empresas</h1>
            <p className="text-xs text-muted-foreground truncate">
              {counts.total} empresas · {counts.withContacts} con contactos · {counts.clientes} clientes · {counts.partners} partners
            </p>
          </div>
        </div>
        <Button onClick={() => navigate("/accounts/new")} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Nueva empresa
        </Button>
      </div>

      {/* Master-detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: list */}
        <div className={cn(
          "w-full lg:w-80 xl:w-96 shrink-0 lg:border-r border-border flex flex-col bg-card/40",
          selectedId && "hidden lg:flex",
        )}>
          {/* Filters */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa, industria, ciudad…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospecto</SelectItem>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="partner_y_cliente">Cliente & Partner</SelectItem>
                </SelectContent>
              </Select>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los países</SelectItem>
                  {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
                    <SelectItem key={code} value={code}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as "name" | "contacts")}>
                <SelectTrigger className="h-8 text-xs w-9 px-0 justify-center" aria-label="Ordenar">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="name">Nombre (A-Z)</SelectItem>
                  <SelectItem value="contacts">Más contactos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground px-4 text-center">
              <Building2 className="w-8 h-8 opacity-30" />
              <p className="text-sm">
                {accounts.length === 0 ? "Aún no hay empresas" : "Sin coincidencias"}
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="py-1">
                {filtered.map(a => {
                  const type = ACCOUNT_TYPE_LABELS[a.account_type] ?? ACCOUNT_TYPE_LABELS.lead;
                  const n = contactCounts[a.id] || 0;
                  const active = selectedId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/accounts/${a.id}`)}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-3 py-2.5 border-l-2 transition-colors",
                        active
                          ? "bg-primary/10 border-primary"
                          : "border-transparent hover:bg-muted/50",
                      )}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                          {getInitials(a.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate", active ? "font-semibold" : "font-medium")}>
                          {a.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", type.color)}>
                            {type.label}
                          </Badge>
                          {a.industry && (
                            <span className="text-[11px] text-muted-foreground truncate">{a.industry}</span>
                          )}
                        </div>
                      </div>
                      <div className={cn(
                        "flex items-center gap-1 text-xs shrink-0",
                        n > 0 ? "text-foreground" : "text-muted-foreground/50",
                      )}>
                        <Users className="w-3.5 h-3.5" />
                        {n}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* RIGHT: detail panel */}
        <div className={cn("flex-1 min-w-0", !selectedId && "hidden lg:block")}>
          <AccountDetailPanel
            accountId={selectedId}
            onBack={() => navigate("/accounts")}
            onDeleted={() => navigate("/accounts")}
          />
        </div>
      </div>
    </div>
  );
}
