import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GitBranch, Plus, Pencil, Trash2, GripVertical, Star } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  usePipelines, usePipelineStages, useCreatePipeline, useUpdatePipeline, useArchivePipeline,
  useCreateStage, useUpdateStage, useDeleteStage, useReorderStages,
  type Pipeline, type PipelineStage, type StageType,
} from "@/hooks/usePipelines";

const STAGE_TYPE_LABELS: Record<StageType, string> = {
  open: "En proceso", won: "Ganada", lost: "Perdida",
};
const COLOR_PRESETS = ["#64748b", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#ef4444"];

export default function SettingsPipelines() {
  const { tenantRole, isSuperAdmin } = useAuth();
  const canManage = isSuperAdmin || tenantRole === "administrador";

  const { data: pipelines = [] } = usePipelines();
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (!selectedId && pipelines.length > 0) {
      setSelectedId((pipelines.find((p) => p.is_default) ?? pipelines[0]).id);
    }
  }, [pipelines, selectedId]);

  if (!canManage) return <Navigate to="/" replace />;

  const selected = pipelines.find((p) => p.id === selectedId) ?? null;

  return (
    <SettingsLayout title="Pipelines" description="Crea y edita tus pipelines y sus etapas" icon={GitBranch}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pipelines</h3>
            <PipelineDialog />
          </div>
          <div className="space-y-1.5">
            {pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm border transition-colors",
                  selectedId === p.id ? "border-primary/50 bg-primary/5 font-medium" : "border-border/50 hover:bg-muted/50"
                )}
              >
                <span className="flex-1 truncate">{p.name}</span>
                {p.is_default && <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="currentColor" />}
              </button>
            ))}
          </div>
        </div>

        {/* Stages of the selected pipeline */}
        <div className="lg:col-span-2">
          {selected ? <StagesEditor pipeline={selected} /> : (
            <p className="text-sm text-muted-foreground">Selecciona un pipeline.</p>
          )}
        </div>
      </div>
    </SettingsLayout>
  );
}

// ─── Pipeline create/edit dialog ──────────────────────────────────────────────
function PipelineDialog({ pipeline }: { pipeline?: Pipeline }) {
  const isEdit = !!pipeline;
  const createP = useCreatePipeline();
  const updateP = useUpdatePipeline();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pipeline?.name ?? "");
  const [description, setDescription] = useState(pipeline?.description ?? "");
  const [isDefault, setIsDefault] = useState(pipeline?.is_default ?? false);

  useEffect(() => {
    if (open) {
      setName(pipeline?.name ?? "");
      setDescription(pipeline?.description ?? "");
      setIsDefault(pipeline?.is_default ?? false);
    }
  }, [open, pipeline]);

  const save = async () => {
    if (!name.trim()) return;
    if (isEdit && pipeline) {
      await updateP.mutateAsync({ id: pipeline.id, updates: { name: name.trim(), description: description || null, is_default: isDefault } });
    } else {
      await createP.mutateAsync({ name: name.trim(), description: description || null, is_default: isDefault });
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Nuevo</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar pipeline" : "Nuevo pipeline"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pipeline Nube de Google" />
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Marcar como pipeline por defecto
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim()}>{isEdit ? "Guardar" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stages editor (sortable list) ────────────────────────────────────────────
function StagesEditor({ pipeline }: { pipeline: Pipeline }) {
  const { data: stages = [] } = usePipelineStages(pipeline.id);
  const reorder = useReorderStages();
  const archiveP = useArchivePipeline();
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => { setOrder(stages.map((s) => s.id)); }, [stages]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const orderedStages = order
    .map((id) => stages.find((s) => s.id === id))
    .filter((s): s is PipelineStage => !!s);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(String(active.id));
    const newIdx = order.indexOf(String(over.id));
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    reorder.mutate({ pipeline_id: pipeline.id, orderedIds: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{pipeline.name}</h3>
          <PipelineDialog pipeline={pipeline} />
          {!pipeline.is_default && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Archivar pipeline?</AlertDialogTitle>
                  <AlertDialogDescription>Dejará de aparecer en el tablero. Las oportunidades no se eliminan.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archiveP.mutate(pipeline.id)} className="bg-destructive text-destructive-foreground">Archivar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <StageDialog pipelineId={pipeline.id} />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {orderedStages.map((stage) => (
              <SortableStageRow key={stage.id} stage={stage} pipelineId={pipeline.id} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {stages.length === 0 && <p className="text-sm text-muted-foreground">Sin etapas. Agrega la primera.</p>}
    </div>
  );
}

function SortableStageRow({ stage, pipelineId }: { stage: PipelineStage; pipelineId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const del = useDeleteStage();
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5">
      <button className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" {...listeners} {...attributes}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="mt-1.5 w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{stage.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{STAGE_TYPE_LABELS[stage.stage_type]}</Badge>
          <span className="text-xs text-muted-foreground">{stage.probability_default}%</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
      <StageDialog pipelineId={pipelineId} stage={stage} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar etapa "{stage.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Si tiene oportunidades, muévelas a otra etapa primero o la eliminación fallará.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate({ id: stage.id, pipeline_id: pipelineId })} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

// ─── Stage create/edit dialog ─────────────────────────────────────────────────
function StageDialog({ pipelineId, stage }: { pipelineId: string; stage?: PipelineStage }) {
  const isEdit = !!stage;
  const createS = useCreateStage();
  const updateS = useUpdateStage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [stageType, setStageType] = useState<StageType>("open");
  const [prob, setProb] = useState("0");

  useEffect(() => {
    if (open) {
      setName(stage?.name ?? "");
      setColor(stage?.color ?? "#64748b");
      setStageType(stage?.stage_type ?? "open");
      setProb(stage ? String(stage.probability_default) : "0");
    }
  }, [open, stage]);

  const save = async () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), color, stage_type: stageType, probability_default: Number(prob) || 0 };
    if (isEdit && stage) {
      await updateS.mutateAsync({ id: stage.id, pipeline_id: pipelineId, updates: payload });
    } else {
      await createS.mutateAsync({ pipeline_id: pipelineId, ...payload });
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Nueva etapa</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar etapa" : "Nueva etapa"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Propuesta enviada" />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn("w-6 h-6 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={stageType} onValueChange={(v) => setStageType(v as StageType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">En proceso</SelectItem>
                  <SelectItem value="won">Ganada</SelectItem>
                  <SelectItem value="lost">Perdida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Probabilidad (%)</Label>
              <Input type="number" min={0} max={100} value={prob} onChange={(e) => setProb(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim()}>{isEdit ? "Guardar" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
