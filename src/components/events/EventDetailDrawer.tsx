import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import {
  Calendar,
  Clock,
  Phone,
  Building,
  FileText,
  Edit,
  XCircle,
  CheckCircle,
  AlertCircle,
  MapPin,
  ExternalLink,
  MessageCircle,
  Trash2,
  CalendarClock,
  Video,
  Download,
  CalendarPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Event, useCancelEvent, useUpdateEvent, useDeleteEvent, useEventAuditLogs, getEventTypeLabel } from "@/hooks/useEvents";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { localDatetimeToTimezoneISO } from "@/lib/timezoneUtils";

interface EventDetailDrawerProps {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: Event) => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  scheduled: { label: "Programado", variant: "secondary", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  confirmed: { label: "Confirmado", variant: "default", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  canceled: { label: "Cancelado", variant: "destructive", className: "bg-destructive/15 text-destructive border-destructive/30" },
  completed: { label: "Completado", variant: "outline", className: "bg-primary/15 text-primary border-primary/30" },
  no_show: { label: "No asistió", variant: "destructive", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
};

const ACTION_LABELS: Record<string, string> = {
  created: "Evento creado",
  updated: "Evento actualizado",
  status_changed: "Estado cambiado",
  canceled: "Evento cancelado",
  rescheduled: "Evento reagendado",
};

function generateICS(event: Event): string {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const escape = (s: string) => s.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brokia24//Events//ES',
    'BEGIN:VEVENT',
    `UID:${event.id}@brokia24`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escape(event.title)}`,
    event.notes ? `DESCRIPTION:${escape(event.notes)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function buildGoogleCalendarUrl(event: Event): string {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: event.notes || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function EventDetailContent({ event, onOpenChange, onEdit }: { event: Event; onOpenChange: (open: boolean) => void; onEdit: (event: Event) => void }) {
  const cancelEvent = useCancelEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const navigate = useNavigate();
  const { data: auditLogs = [], isLoading: isLoadingLogs } = useEventAuditLogs(event.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [noShowReason, setNoShowReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");

  const statusConfig = STATUS_CONFIG[event.status] || STATUS_CONFIG.scheduled;
  const metadata = (event.metadata || {}) as Record<string, unknown>;
  const propertyId = metadata.property_id as string | undefined;
  const propertyTitle = metadata.property_title as string | undefined;
  const propertyCode = metadata.property_code as string | undefined;
  const videoLink = metadata.video_link as string | undefined;
  const hasProperty = !!propertyId;

  const otherMetadata = Object.entries(metadata).filter(
    ([key]) => !['property_id', 'property_title', 'property_code', 'video_link'].includes(key)
  );

  const handleExportICS = () => {
    const ics = generateICS(event);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReschedule = () => {
    if (!rescheduleDate) return;
    const startISO = localDatetimeToTimezoneISO(rescheduleDate);
    const durationMs = event.end_at
      ? new Date(event.end_at).getTime() - new Date(event.start_at).getTime()
      : 60 * 60 * 1000;
    const endISO = new Date(new Date(startISO).getTime() + durationMs).toISOString();
    updateEvent.mutate(
      { id: event.id, start_at: startISO, end_at: endISO },
      { onSuccess: () => { setShowReschedule(false); setRescheduleDate(""); } }
    );
  };

  const contactInitials = event.contact?.name
    ? event.contact.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'C';

  const handleCancel = () => {
    cancelEvent.mutate({ id: event.id, reason: cancelReason || undefined }, {
      onSuccess: () => { setConfirmCancel(false); setCancelReason(""); onOpenChange(false); }
    });
  };

  const handleDelete = () => {
    deleteEvent.mutate(event.id, { onSuccess: () => onOpenChange(false) });
  };

  const handleStatusChange = (newStatus: Event['status']) => {
    updateEvent.mutate({ id: event.id, status: newStatus });
  };

  const handleNoShow = () => {
    updateEvent.mutate({ id: event.id, status: 'no_show' }, {
      onSuccess: () => { setConfirmNoShow(false); setNoShowReason(""); }
    });
  };

  const isActive = event.status !== 'canceled' && event.status !== 'completed' && event.status !== 'no_show';

  return (
    <>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <Badge variant="outline" className="capitalize text-[11px] px-2 py-0.5">
            {getEventTypeLabel(event.event_type)}
          </Badge>
          <Badge className={`${statusConfig.className} text-[11px] px-2 py-0.5`}>
            {statusConfig.label}
          </Badge>
        </div>
        <h2 className="text-base font-semibold text-foreground leading-tight break-words">{event.title}</h2>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="px-4 py-3 space-y-3">
          {/* Date & Time */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-primary/5 border border-primary/15">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm capitalize break-words">
                {format(new Date(event.start_at), "EEEE, d 'de' MMMM yyyy", { locale: es })}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 shrink-0" />
                {format(new Date(event.start_at), "HH:mm")}
                {event.end_at && ` – ${format(new Date(event.end_at), "HH:mm")}`}
              </p>
            </div>
          </div>

          {/* Contact */}
          {event.contact && (
            <div className="flex items-center gap-2 w-full max-w-full">
              <div 
                className="flex-1 min-w-0 flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border/50 cursor-pointer hover:bg-muted/60 transition-colors"
                onClick={() => navigate(`/contacts/${event.contact!.id}`)}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                    {contactInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{event.contact.name}</p>
                  {event.contact.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span className="truncate">{event.contact.phone}</span>
                    </p>
                  )}
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
              {event.contact.phone && (
                <a
                  href={`tel:${event.contact.phone}`}
                  className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Llamar"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                title="Ir al chat"
                onClick={() => navigate(`/inbox?contact_id=${event.contact!.id}`)}
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Property */}
          {hasProperty && (
            <div 
              className="p-2.5 rounded-lg border border-border/50 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors w-full max-w-full overflow-hidden"
              onClick={() => navigate(`/properties/${propertyId}`)}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    Inmueble a visitar
                  </p>
                  <p className="font-medium text-sm truncate">{propertyTitle || 'Propiedad'}</p>
                  {propertyCode && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-1">
                      {propertyCode}
                    </Badge>
                  )}
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
              </div>
            </div>
          )}

          {/* Video Link */}
          {videoLink && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Video className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">Videollamada</p>
                <a
                  href={videoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 underline truncate block"
                >
                  {videoLink}
                </a>
              </div>
            </div>
          )}

          {/* Notes */}
          {event.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Comentarios
                </p>
                <p className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 border border-border/30 break-words whitespace-normal">
                  {event.notes}
                </p>
              </div>
            </>
          )}

          {/* Other Metadata */}
          {otherMetadata.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Campos adicionales
                </p>
                <div className="rounded-lg border border-border/50 divide-y divide-border/30 w-full overflow-hidden">
                  {otherMetadata.map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center px-3 py-2 text-xs gap-2">
                      <span className="text-muted-foreground capitalize shrink-0">{key.replace(/_/g, ' ')}</span>
                      <span className="font-medium text-foreground truncate text-right">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Quick Actions */}
          {isActive && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Acciones rápidas
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {event.status === 'scheduled' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-auto py-2.5 flex-col gap-1 border-green-500/30 hover:bg-green-500/10 hover:text-green-400"
                      onClick={() => handleStatusChange('confirmed')}
                      disabled={updateEvent.isPending}
                    >
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-xs">Confirmar</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto py-2.5 flex-col gap-1 border-primary/30 hover:bg-primary/10 hover:text-primary"
                    onClick={() => handleStatusChange('completed')}
                    disabled={updateEvent.isPending}
                  >
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span className="text-xs">Completado</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto py-2.5 flex-col gap-1 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-400"
                    onClick={() => setConfirmNoShow(true)}
                    disabled={updateEvent.isPending}
                  >
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span className="text-xs">No asistió</span>
                  </Button>
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Audit Log */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Historial
            </p>
            {isLoadingLogs ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Sin historial</p>
            ) : (
              <div className="space-y-0 relative pl-4 border-l-2 border-border/50">
                {auditLogs.map((log) => (
                  <div key={log.id} className="relative pb-3 last:pb-0">
                    <div className="absolute -left-[calc(1rem+5px)] top-1.5 w-2 h-2 rounded-full bg-primary" />
                    <p className="text-sm font-medium">{ACTION_LABELS[log.action] || log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          {/* Export */}
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Exportar
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleExportICS}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Descargar .ics
              </Button>
              <a
                href={buildGoogleCalendarUrl(event)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button size="sm" variant="outline" className="w-full text-xs">
                  <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
                  Google Calendar
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex flex-col gap-2 shrink-0">
        {/* Reschedule inline */}
        {showReschedule && (
          <div className="flex gap-2 items-center">
            <Input
              type="datetime-local"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="flex-1 h-8 text-xs"
            />
            <Button
              size="sm"
              className="text-xs h-8"
              onClick={handleReschedule}
              disabled={!rescheduleDate || updateEvent.isPending}
            >
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-8"
              onClick={() => { setShowReschedule(false); setRescheduleDate(""); }}
            >
              ✕
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onEdit(event)}
          >
            <Edit className="w-3.5 h-3.5 mr-1.5" />
            Editar
          </Button>
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setShowReschedule(!showReschedule)}
            >
              <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
              Reagendar
            </Button>
          )}
          {isActive && (
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelEvent.isPending}
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />
              Cancelar
            </Button>
          )}
          {event.status === 'canceled' && (
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteEvent.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      {/* Confirm cancel dialog */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará <strong>"{event.title}"</strong> como cancelada. El historial quedará registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Textarea
              placeholder="Motivo de cancelación (opcional)..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="resize-none text-sm min-h-[70px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelEvent.isPending} onClick={() => setCancelReason("")}>
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelEvent.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sí, cancelar cita
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">¿Eliminar esta cita?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. Se eliminará <strong>"{event.title}"</strong> y todo su historial. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEvent.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteEvent.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm no-show dialog */}
      <AlertDialog open={confirmNoShow} onOpenChange={setConfirmNoShow}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como no asistió?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará que el contacto no se presentó a <strong>"{event.title}"</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Textarea
              placeholder="Motivo o notas adicionales (opcional)..."
              value={noShowReason}
              onChange={(e) => setNoShowReason(e.target.value)}
              className="resize-none text-sm min-h-[70px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateEvent.isPending} onClick={() => setNoShowReason("")}>
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleNoShow}
              disabled={updateEvent.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Confirmar no asistió
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function EventDetailDrawer({ event, open, onOpenChange, onEdit }: EventDetailDrawerProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] sm:max-w-[550px] p-0 !flex !flex-col max-h-[85vh] overflow-hidden gap-0 rounded-xl">
        <DialogTitle className="sr-only">{event.title}</DialogTitle>
        <EventDetailContent event={event} onOpenChange={onOpenChange} onEdit={onEdit} />
      </DialogContent>
    </Dialog>
  );
}
