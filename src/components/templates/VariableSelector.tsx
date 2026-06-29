import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Variable } from "lucide-react";
import { useCustomFields } from "@/hooks/useCustomFields";

interface VariableSelectorProps {
  onSelect: (variable: string) => void;
}

const baseContactFields = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'pais', label: 'País' },
];

const agentFields = [
  { key: 'asesor', label: 'Nombre del asesor' },
  { key: 'empresa', label: 'Nombre de la empresa' },
];

const propertyFields = [
  { key: 'inmueble', label: 'Nombre / clave del inmueble' },
  { key: 'direccion', label: 'Dirección del inmueble' },
  { key: 'url_maps', label: 'Link Google Maps' },
  { key: 'precio', label: 'Precio' },
];

const appointmentFields = [
  { key: 'fecha_visita', label: 'Fecha de la visita' },
  { key: 'hora_visita', label: 'Hora de la visita' },
];

const campaignFields = [
  { key: 'campaña', label: 'Nombre de campaña' },
  { key: 'fecha_envio', label: 'Fecha de envío' },
];

export function VariableSelector({ onSelect }: VariableSelectorProps) {
  const { customFields } = useCustomFields();
  
  const handleSelect = (key: string, isCustom: boolean = false) => {
    const variable = isCustom ? `custom.${key}` : key;
    onSelect(`{{${variable}}}`);
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Variable className="w-4 h-4 mr-2" />
          Insertar variable
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>👤 Contacto</DropdownMenuLabel>
        {baseContactFields.map((field) => (
          <DropdownMenuItem key={field.key} onClick={() => handleSelect(field.key)}>
            <code className="mr-2 text-xs bg-accent/20 px-1 rounded shrink-0">{`{{${field.key}}}`}</code>
            <span className="text-muted-foreground text-xs">{field.label}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>🏢 Asesor y empresa</DropdownMenuLabel>
        {agentFields.map((field) => (
          <DropdownMenuItem key={field.key} onClick={() => handleSelect(field.key)}>
            <code className="mr-2 text-xs bg-accent/20 px-1 rounded shrink-0">{`{{${field.key}}}`}</code>
            <span className="text-muted-foreground text-xs">{field.label}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>🏠 Inmueble</DropdownMenuLabel>
        {propertyFields.map((field) => (
          <DropdownMenuItem key={field.key} onClick={() => handleSelect(field.key)}>
            <code className="mr-2 text-xs bg-accent/20 px-1 rounded shrink-0">{`{{${field.key}}}`}</code>
            <span className="text-muted-foreground text-xs">{field.label}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>📅 Cita / Visita</DropdownMenuLabel>
        {appointmentFields.map((field) => (
          <DropdownMenuItem key={field.key} onClick={() => handleSelect(field.key)}>
            <code className="mr-2 text-xs bg-accent/20 px-1 rounded shrink-0">{`{{${field.key}}}`}</code>
            <span className="text-muted-foreground text-xs">{field.label}</span>
          </DropdownMenuItem>
        ))}

        {customFields.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>⚙️ Campos personalizados</DropdownMenuLabel>
            {customFields.map((field) => (
              <DropdownMenuItem key={field.id} onClick={() => handleSelect(field.key, true)}>
                <code className="mr-2 text-xs bg-accent/20 px-1 rounded shrink-0">{`{{custom.${field.key}}}`}</code>
                <span className="text-muted-foreground text-xs">{field.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>📣 Campaña</DropdownMenuLabel>
        {campaignFields.map((field) => (
          <DropdownMenuItem key={field.key} onClick={() => handleSelect(field.key)}>
            <code className="mr-2 text-xs bg-accent/20 px-1 rounded shrink-0">{`{{${field.key}}}`}</code>
            <span className="text-muted-foreground text-xs">{field.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
