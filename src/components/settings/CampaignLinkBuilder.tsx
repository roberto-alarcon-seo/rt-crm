import { useMemo, useState } from 'react';
import { Link2, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { buildWaMeLink, type CampaignAttribution } from '@/lib/campaignLink';
import { toast } from 'sonner';

interface Props {
  /** Número de WhatsApp del negocio, tal como viene de la integración. */
  businessPhone: string | null;
}

/**
 * Genera enlaces wa.me que conservan la atribución de la campaña.
 *
 * Un enlace wa.me normal pierde los UTMs al abrir WhatsApp, así que el lead
 * entra sin origen. Aquí se codifican al final del texto prellenado y el webhook
 * de entrada los lee y los guarda en la atribución del contacto, quitándolos del
 * mensaje antes de mostrarlo.
 */
export function CampaignLinkBuilder({ businessPhone }: Props) {
  const [message, setMessage] = useState('Hola, quiero saber más de Random Truffle');
  const [utm, setUtm] = useState<CampaignAttribution>({
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
  });
  const [copied, setCopied] = useState(false);

  const link = useMemo(
    () => (businessPhone ? buildWaMeLink(businessPhone, message, utm) : ''),
    [businessPhone, message, utm],
  );

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Enlace copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const field = (key: keyof CampaignAttribution, label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key} className="text-xs">{label}</Label>
      <Input
        id={key}
        className="h-8 text-sm"
        value={utm[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setUtm((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          Enlaces de campaña con atribución
        </CardTitle>
        <CardDescription>
          Genera el enlace de WhatsApp para una campaña. El origen viaja dentro del mensaje y queda
          registrado en la atribución del lead, en lugar de perderse al abrir WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!businessPhone && (
          <p className="text-sm text-muted-foreground">
            Conecta un número de WhatsApp para generar enlaces.
          </p>
        )}

        {businessPhone && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="wa-message" className="text-xs">Mensaje prellenado</Label>
              <Textarea
                id="wa-message"
                rows={2}
                className="resize-none text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {field('utm_source', 'Origen (utm_source)', 'linkedin')}
              {field('utm_medium', 'Medio (utm_medium)', 'social')}
              {field('utm_campaign', 'Campaña (utm_campaign)', 'q3-demo')}
              {field('utm_content', 'Contenido (utm_content)', 'post-1')}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Enlace generado</Label>
              <div className="flex items-start gap-2">
                <code className="flex-1 text-xs bg-muted/60 rounded-md p-2 break-all">{link}</code>
                <Button variant="outline" size="icon" onClick={copy} aria-label="Copiar enlace">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                El marcador entre corchetes se borra del mensaje al recibirlo: el contacto no lo ve en su historial.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
