import { useRef } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Download, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTwilioIntegration } from "@/hooks/useTwilioIntegration";
import { Property } from "@/hooks/useProperties";

interface PropertyQRCodeProps {
  property: Property;
}

export default function PropertyQRCode({ property }: PropertyQRCodeProps) {
  const { isConnected, integration } = useTwilioIntegration();
  const hiddenCanvasRef = useRef<HTMLDivElement>(null);

  const isActive = property.is_active && property.status !== "inactive";
  const hasPhone = isConnected && !!integration?.phone_number;

  if (!isActive || !hasPhone) return null;

  const phoneNumber = integration!.phone_number!
    .replace("whatsapp:", "")
    .replace("+", "")
    .replace(/\s/g, "");

  const message = `Quiero más información de la propiedad en ${property.zone} con ID:${property.property_code}`;
  const waUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  const handleDownload = () => {
    const canvas = hiddenCanvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR-${property.property_code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <QrCode className="h-4 w-4" />
          Código QR WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-center p-3 bg-white rounded-lg">
          <QRCodeSVG
            value={waUrl}
            size={160}
            level="H"
            includeMargin={false}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center leading-snug">
          Escanea para iniciar una conversación sobre{" "}
          <span className="font-medium">{property.property_code}</span>
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleDownload}
        >
          <Download className="mr-2 h-4 w-4" />
          Descargar QR
        </Button>
        {/* Hidden high-resolution canvas for download */}
        <div ref={hiddenCanvasRef} className="hidden">
          <QRCodeCanvas value={waUrl} size={1024} level="H" includeMargin />
        </div>
      </CardContent>
    </Card>
  );
}
