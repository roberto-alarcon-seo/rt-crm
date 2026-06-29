import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Building2, Globe, MapPin, Users, Mail, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAccount, useCreateAccount, useUpdateAccount, AccountFormData } from "@/hooks/useAccounts";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ACCOUNT_TYPES = [
  { value: "lead",              label: "Lead" },
  { value: "prospect",          label: "Prospecto" },
  { value: "cliente",           label: "Cliente" },
  { value: "partner",           label: "Partner" },
  { value: "partner_y_cliente", label: "Partner y Cliente" },
];

const INDUSTRIES = [
  { value: "tecnologia",      label: "Tecnología" },
  { value: "retail",          label: "Retail / Comercio" },
  { value: "manufactura",     label: "Manufactura" },
  { value: "servicios",       label: "Servicios profesionales" },
  { value: "salud",           label: "Salud" },
  { value: "educacion",       label: "Educación" },
  { value: "finanzas",        label: "Finanzas / Banca" },
  { value: "logistica",       label: "Logística / Transporte" },
  { value: "gobierno",        label: "Gobierno / Sector público" },
  { value: "media",           label: "Media / Entretenimiento" },
  { value: "energia",         label: "Energía" },
  { value: "construccion",    label: "Construcción / Inmobiliario" },
  { value: "otro",            label: "Otro" },
];

const EMPLOYEE_RANGES = [
  { value: "1-10",      label: "1-10 empleados" },
  { value: "11-50",     label: "11-50 empleados" },
  { value: "51-200",    label: "51-200 empleados" },
  { value: "201-500",   label: "201-500 empleados" },
  { value: "501-1000",  label: "501-1000 empleados" },
  { value: "1000+",     label: "1000+ empleados" },
];

const COUNTRIES = [
  { value: "MX", label: "México" },
  { value: "CO", label: "Colombia" },
  { value: "CL", label: "Chile" },
  { value: "AR", label: "Argentina" },
  { value: "PE", label: "Perú" },
  { value: "US", label: "Estados Unidos" },
];

const EMPTY_FORM: AccountFormData = {
  name: "",
  account_type: "lead",
  industry: "",
  website: "",
  country: "",
  city: "",
  employee_count: "",
  gcp_ae_name: "",
  gcp_ae_email: "",
  notes: "",
};

export default function AccountEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const { hasRole } = useAuth();

  const { account, isLoading: loadingAccount } = useAccount(id);
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();

  const [formData, setFormData] = useState<AccountFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const canManage = hasRole(["administrador", "manager"]);

  useEffect(() => {
    if (isEditing && account) {
      setFormData({
        name: account.name,
        account_type: account.account_type,
        industry: account.industry || "",
        website: account.website || "",
        country: account.country || "",
        city: account.city || "",
        employee_count: account.employee_count || "",
        gcp_ae_name: account.gcp_ae_name || "",
        gcp_ae_email: account.gcp_ae_email || "",
        notes: account.notes || "",
      });
    }
  }, [id, account, isEditing]);

  const set = (field: keyof AccountFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("El nombre de la empresa es requerido");
      return;
    }
    setIsSaving(true);
    try {
      if (isEditing) {
        await updateAccount.mutateAsync({ id: id!, ...formData });
        navigate(`/accounts/${id}`);
      } else {
        const created = await createAccount.mutateAsync(formData);
        navigate(`/accounts/${created.id}`);
      }
    } catch {
      // errors handled by mutation hooks
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing && loadingAccount) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(isEditing ? `/accounts/${id}` : "/accounts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">
            {isEditing ? "Editar empresa" : "Nueva empresa"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing ? account?.name : "Agrega una empresa al CRM"}
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving || !canManage}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar
        </Button>
      </div>

      {/* General info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Información general
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la empresa *</Label>
            <Input
              id="name"
              placeholder="Ej. Acme Corp"
              value={formData.name}
              onChange={e => set("name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de cuenta</Label>
              <Select value={formData.account_type} onValueChange={v => set("account_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Industria</Label>
              <Select value={formData.industry || ""} onValueChange={v => set("industry", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(i => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website" className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" /> Sitio web
            </Label>
            <Input
              id="website"
              placeholder="https://ejemplo.com"
              value={formData.website || ""}
              onChange={e => set("website", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Ubicación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>País</Label>
              <Select value={formData.country || ""} onValueChange={v => set("country", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                placeholder="Ciudad de México"
                value={formData.city || ""}
                onChange={e => set("city", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company size */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Tamaño y contexto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Número de empleados</Label>
            <Select value={formData.employee_count || ""} onValueChange={v => set("employee_count", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar rango…" /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_RANGES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* GCP Account Executive */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Account Executive GCP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gcp_ae_name">Nombre del AE</Label>
              <Input
                id="gcp_ae_name"
                placeholder="Nombre completo"
                value={formData.gcp_ae_name || ""}
                onChange={e => set("gcp_ae_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gcp_ae_email">Email del AE</Label>
              <Input
                id="gcp_ae_email"
                type="email"
                placeholder="ae@google.com"
                value={formData.gcp_ae_email || ""}
                onChange={e => set("gcp_ae_email", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Notas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Contexto relevante sobre esta empresa…"
            value={formData.notes || ""}
            onChange={e => set("notes", e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>
    </div>
  );
}
