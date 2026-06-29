import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Plus, Search, Filter, Globe, Users,
  TrendingUp, Handshake, ChevronRight, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import { cn } from "@/lib/utils";

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  lead:               { label: "Lead",        color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  prospect:           { label: "Prospecto",   color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  cliente:            { label: "Cliente",     color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  partner:            { label: "Partner",     color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  partner_y_cliente:  { label: "Cliente & Partner", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const COUNTRY_LABELS: Record<string, string> = {
  MX: "🇲🇽 México",
  CO: "🇨🇴 Colombia",
  CL: "🇨🇱 Chile",
  AR: "🇦🇷 Argentina",
  PE: "🇵🇪 Perú",
  US: "🇺🇸 Estados Unidos",
};

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function Accounts() {
  const navigate = useNavigate();
  const { accounts, isLoading } = useAccounts();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  const filtered = accounts.filter(a => {
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.industry?.toLowerCase().includes(search.toLowerCase()) ||
      a.city?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || a.account_type === typeFilter;
    const matchCountry = countryFilter === "all" || a.country === countryFilter;
    return matchSearch && matchType && matchCountry;
  });

  const counts = {
    total: accounts.length,
    clientes: accounts.filter(a => a.account_type === 'cliente' || a.account_type === 'partner_y_cliente').length,
    partners: accounts.filter(a => a.account_type === 'partner' || a.account_type === 'partner_y_cliente').length,
    pipeline: accounts.filter(a => ['lead', 'prospect'].includes(a.account_type)).length,
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              Empresas
            </h1>
            <p className="text-sm text-muted-foreground">
              Clientes, partners y prospectos de Random Truffle
            </p>
          </div>
          <Button onClick={() => navigate("/accounts/new")} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Nueva empresa
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Total", value: counts.total, icon: Building2 },
            { label: "En Pipeline", value: counts.pipeline, icon: TrendingUp },
            { label: "Clientes", value: counts.clientes, icon: Users },
            { label: "Partners", value: counts.partners, icon: Handshake },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40 border border-border/50">
              <stat.icon className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-semibold leading-tight">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa, industria, ciudad..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
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
            <SelectTrigger className="w-40">
              <SelectValue placeholder="País" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los países</SelectItem>
              {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
                <SelectItem key={code} value={code}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Building2 className="w-10 h-10 opacity-30" />
            <p className="text-sm">
              {accounts.length === 0
                ? "Aún no hay empresas registradas"
                : "No hay empresas que coincidan con los filtros"}
            </p>
            {accounts.length === 0 && (
              <Button size="sm" onClick={() => navigate("/accounts/new")}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar primera empresa
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(account => {
              const typeConfig = ACCOUNT_TYPE_LABELS[account.account_type] ?? ACCOUNT_TYPE_LABELS.lead;
              return (
                <Card
                  key={account.id}
                  className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
                  onClick={() => navigate(`/accounts/${account.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                          {getInitials(account.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{account.name}</h3>
                        {account.industry && (
                          <p className="text-xs text-muted-foreground truncate">{account.industry}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
                    </div>

                    <div className="space-y-1.5">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5", typeConfig.color)}>
                        {typeConfig.label}
                      </Badge>

                      {(account.country || account.city) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Globe className="w-3 h-3" />
                          <span>
                            {[account.city, account.country ? COUNTRY_LABELS[account.country]?.split(" ")[1] : account.country]
                              .filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}

                      {account.gcp_ae_name && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span>AE: {account.gcp_ae_name}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
