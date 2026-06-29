import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PIPELINE_STAGES, CAPTACION_PIPELINE_STAGES, RENTAS_PIPELINE_STAGES } from "./PipelineStepper";
import { usePipelineStageChange } from "@/hooks/usePipelineStageChange";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PipelineType = 'calificacion' | 'captacion' | 'rentas';

const DEFAULT_STAGE: Record<PipelineType, string> = {
  calificacion: 'new_lead',
  captacion: 'captacion_new',
  rentas: 'renta_nuevo',
};

function stageListFor(type: PipelineType) {
  if (type === 'captacion') return CAPTACION_PIPELINE_STAGES;
  if (type === 'rentas') return RENTAS_PIPELINE_STAGES;
  return PIPELINE_STAGES;
}

function inferPipelineType(stage: string, prop?: string): PipelineType {
  if (prop === 'captacion' || prop === 'rentas' || prop === 'calificacion') return prop;
  if (stage.startsWith('captacion_')) return 'captacion';
  if (stage.startsWith('renta_')) return 'rentas';
  return 'calificacion';
}

interface PipelineHeaderSelectProps {
  contactId: string;
  currentStage: string;
  pipelineType?: string;
  conversationId?: string;
  assignedAgentId?: string | null;
}

export function PipelineHeaderSelect({
  contactId,
  currentStage,
  pipelineType: pipelineTypeProp,
  conversationId,
  assignedAgentId,
}: PipelineHeaderSelectProps) {
  const [localPipelineType, setLocalPipelineType] = useState<PipelineType>(
    inferPipelineType(currentStage, pipelineTypeProp)
  );
  const [localStage, setLocalStage] = useState(currentStage);
  const [isUpdating, setIsUpdating] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const { handlePipelineStageChange } = usePipelineStageChange();
  const queryClient = useQueryClient();
  const { user, tenantRole, isSuperAdmin } = useAuth();

  useEffect(() => {
    setLocalStage(currentStage);
    setLocalPipelineType(inferPipelineType(currentStage, pipelineTypeProp));
  }, [currentStage, pipelineTypeProp]);

  const stages = stageListFor(localPipelineType);

  const closedStage = localPipelineType === 'captacion' ? 'captacion_sold'
    : localPipelineType === 'rentas' ? 'renta_cerrado'
    : 'closed_won';
  const lostStage = localPipelineType === 'captacion' ? 'captacion_lost'
    : localPipelineType === 'rentas' ? 'renta_perdido'
    : 'closed_lost';
  const isClosed = localStage === closedStage;
  const isLost   = localStage === lostStage;

  const isAsesor = tenantRole === 'asesor' && !isSuperAdmin;
  const isUnassigned = !assignedAgentId;
  const isOwnedByOther = !!assignedAgentId && assignedAgentId !== user?.id;

  const performStageUpdate = async (newStage: string, newPipelineType?: PipelineType) => {
    const oldStage = localStage;
    setIsUpdating(true);
    try {
      const updatePayload: Record<string, string> = { pipeline_stage: newStage };
      if (newPipelineType) updatePayload.pipeline_type = newPipelineType;

      const { error } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', contactId);

      if (error) throw error;

      setLocalStage(newStage);
      if (newPipelineType) setLocalPipelineType(newPipelineType);
      if (!newPipelineType) await handlePipelineStageChange(contactId, oldStage, newStage);

      // Log activity
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', authUser?.id ?? '')
          .single();

        if (profile?.tenant_id) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_id', contactId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (conv) {
            const eventType = newPipelineType ? 'pipeline_type_changed' : 'pipeline_stage_changed';
            const stageList = stageListFor(newPipelineType ?? localPipelineType);
            await supabase.from('conversation_activity').insert({
              tenant_id: profile.tenant_id,
              conversation_id: conv.id,
              contact_id: contactId,
              actor_user_id: authUser?.id ?? null,
              actor_type: 'user',
              event_type: eventType,
              payload: newPipelineType
                ? { old_type: localPipelineType, new_type: newPipelineType, new_stage: newStage }
                : {
                    old_stage: oldStage,
                    new_stage: newStage,
                    old_label: stages.find(s => s.value === oldStage)?.label,
                    new_label: stageList.find(s => s.value === newStage)?.label,
                  },
            });
          }
        }
      } catch (e) {
        console.warn('Failed to log activity:', e);
      }

      queryClient.invalidateQueries({ queryKey: ['contact-pipeline', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });

      if (newPipelineType) {
        const labels: Record<PipelineType, string> = { calificacion: 'Compradores', captacion: 'Captación', rentas: 'Rentas' };
        toast.success(`Pipeline cambiado a: ${labels[newPipelineType]}`);
      } else {
        toast.success(`Etapa: ${stages.find(s => s.value === newStage)?.label}`);
      }
    } catch (error) {
      console.error('Error updating pipeline:', error);
      toast.error('Error al actualizar pipeline');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStageChange = async (newStage: string) => {
    if (isUpdating || newStage === localStage) return;

    if (isAsesor && isOwnedByOther) {
      toast.error("Este lead pertenece a otro asesor. Pídele que haga el cambio o escala a tu manager.");
      return;
    }

    if (isAsesor && isUnassigned && conversationId) {
      setPendingStage(newStage);
      setClaimDialogOpen(true);
      return;
    }

    await performStageUpdate(newStage);
  };

  const handlePipelineTypeChange = async (newType: PipelineType) => {
    if (isUpdating || newType === localPipelineType) return;
    if (isAsesor && isOwnedByOther) {
      toast.error("Este lead pertenece a otro asesor.");
      return;
    }
    const newStage = DEFAULT_STAGE[newType];
    await performStageUpdate(newStage, newType);
  };

  const handleConfirmClaim = async () => {
    if (!conversationId || !pendingStage) return;
    setClaimDialogOpen(false);
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.rpc('fn_claim_conversation', {
        p_conversation_id: conversationId,
        p_reason: 'manual_claim_pipeline_change',
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) {
        const code = row?.error_code || 'CLAIM_FAILED';
        if (code === 'ALREADY_ASSIGNED') {
          toast.error("Otro asesor tomó este lead primero.");
        } else {
          toast.error(`No se pudo tomar el lead (${code})`);
        }
        setIsUpdating(false);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['contact-pipeline', contactId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success("Lead asignado a ti");
    } catch (e) {
      console.error('claim error', e);
      toast.error("Error al tomar el lead");
      setIsUpdating(false);
      return;
    } finally {
      setIsUpdating(false);
    }
    const stage = pendingStage;
    setPendingStage(null);
    await performStageUpdate(stage);
  };

  const currentLabel = stages.find(s => s.value === localStage)?.short || localStage;
  const currentIndex = stages.findIndex(s => s.value === localStage);

  const PIPELINE_BUTTONS: { type: PipelineType; label: string }[] = [
    { type: 'calificacion', label: 'Comp.' },
    { type: 'captacion',    label: 'Capt.' },
    { type: 'rentas',       label: 'Renta' },
  ];

  const PIPELINE_LABELS: Record<PipelineType, string> = {
    calificacion: 'Compradores',
    captacion: 'Captación',
    rentas: 'Rentas',
  };

  return (
    <>
    <div className="flex items-center gap-1.5">
      {/* Pipeline type switcher */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-full p-0.5">
              {PIPELINE_BUTTONS.map(({ type, label }) => (
                <button
                  key={type}
                  disabled={isUpdating}
                  onClick={() => handlePipelineTypeChange(type)}
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full transition-all",
                    localPipelineType === type
                      ? type === 'rentas'
                        ? "bg-violet-600 text-white shadow-sm"
                        : type === 'captacion'
                        ? "bg-amber-600 text-white shadow-sm"
                        : "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Pipeline: {PIPELINE_LABELS[localPipelineType]}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Stage select */}
      <Select value={localStage} onValueChange={handleStageChange} disabled={isUpdating}>
        <SelectTrigger
          className={cn(
            "h-7 w-auto min-w-[120px] max-w-[160px] text-xs font-medium border-0 gap-1 px-2.5 rounded-full",
            isLost && "bg-destructive/15 text-destructive hover:bg-destructive/20",
            isClosed && "bg-green-500/15 text-green-400 hover:bg-green-500/20",
            !isClosed && !isLost && "bg-primary/15 text-primary hover:bg-primary/20"
          )}
          title={isAsesor && isOwnedByOther ? "Lead asignado a otro asesor" : undefined}
        >
          <span className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            isLost ? "bg-destructive" : isClosed ? "bg-green-500" : "bg-primary"
          )} />
          <SelectValue>{currentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-popover border border-border z-50">
          {stages.map((stage, index) => (
            <SelectItem
              key={stage.value}
              value={stage.value}
              className="text-xs"
            >
              <span className="flex items-center gap-2">
                <span className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                  index < currentIndex && "bg-primary text-primary-foreground",
                  index === currentIndex && "bg-primary text-primary-foreground ring-1 ring-primary/50",
                  index > currentIndex && "bg-muted text-muted-foreground"
                )}>
                  {index + 1}
                </span>
                {stage.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <AlertDialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tomar este lead</AlertDialogTitle>
          <AlertDialogDescription>
            Este lead aún no tiene asesor asignado. Para cambiar la etapa a{" "}
            <strong>{stages.find(s => s.value === pendingStage)?.label}</strong>{" "}
            primero se te asignará a ti. ¿Continuar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingStage(null)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmClaim}>Tomar y continuar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
