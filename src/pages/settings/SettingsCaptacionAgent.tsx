import { useState, useEffect } from 'react';
import {
  Home, Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
  MessageSquare, Edit3, Check, X, UserCog, ListChecks, Sparkles, Shield,
} from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  useCaptacionSettings,
  useUpdateCaptacionSettings,
  DEFAULT_CAPTACION_QUESTIONS,
  type CaptacionSettings,
  type CaptacionQuestion,
  type QuestionType,
} from '@/hooks/useCaptacionSettings';
import { cn } from '@/lib/utils';

// ── helpers ────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  open: 'Abierta',
  choice: 'Opción múltiple',
  number: 'Numérica',
};

const OPERATION_OPTIONS = [
  { value: 'both', label: 'Venta y renta' },
  { value: 'sale', label: 'Solo venta' },
  { value: 'rent', label: 'Solo renta' },
];

function newQuestion(order: number): CaptacionQuestion {
  return { id: `q_${Date.now()}`, label: '', question: '', type: 'open', options: [], required: false, enabled: true, order };
}

// Matches the ToggleRow pattern from SettingsAIConfig
function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border">
      <div className="pr-4">
        <Label>{label}</Label>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ── question editor dialog ─────────────────────────────────────────────────

interface QuestionEditorProps {
  question: CaptacionQuestion | null;
  onSave: (q: CaptacionQuestion) => void;
  onClose: () => void;
}

function QuestionEditorDialog({ question, onSave, onClose }: QuestionEditorProps) {
  const [draft, setDraft] = useState<CaptacionQuestion>(question ?? newQuestion(0));
  const [optionInput, setOptionInput] = useState('');

  useEffect(() => {
    setDraft(question ?? newQuestion(0));
    setOptionInput('');
  }, [question]);

  const addOption = () => {
    const t = optionInput.trim();
    if (!t) return;
    setDraft(d => ({ ...d, options: [...(d.options ?? []), t] }));
    setOptionInput('');
  };

  const removeOption = (i: number) =>
    setDraft(d => ({ ...d, options: (d.options ?? []).filter((_, idx) => idx !== i) }));

  const valid = draft.label.trim() && draft.question.trim();

  return (
    <Dialog open={!!question} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {!draft.label ? 'Nueva pregunta' : 'Editar pregunta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Etiqueta interna</Label>
            <Input
              placeholder="ej. Tipo de inmueble"
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Pregunta (texto enviado al contacto)</Label>
            <Textarea
              placeholder="¿Qué tipo de inmueble deseas vender?"
              rows={3}
              value={draft.question}
              onChange={e => setDraft(d => ({ ...d, question: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de respuesta</Label>
              <Select
                value={draft.type}
                onValueChange={v => setDraft(d => ({ ...d, type: v as QuestionType, options: v === 'choice' ? (d.options ?? []) : [] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([val, lbl]) => (
                    <SelectItem key={val} value={val}>{lbl}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3 p-4 rounded-lg border">
              <Switch
                id="req-toggle"
                checked={draft.required}
                onCheckedChange={v => setDraft(d => ({ ...d, required: v }))}
              />
              <Label htmlFor="req-toggle" className="cursor-pointer">Obligatoria</Label>
            </div>
          </div>

          {draft.type === 'choice' && (
            <div className="space-y-2">
              <Label>Opciones de respuesta</Label>
              <div className="space-y-1.5">
                {(draft.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 text-sm border rounded px-3 py-1.5 bg-muted/40">{opt}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeOption(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Añadir opción..."
                  value={optionInput}
                  onChange={e => setOptionInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  className="h-9 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid} onClick={() => onSave(draft)}>
            <Check className="mr-2 h-4 w-4" />
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── flow preview (WhatsApp style) ──────────────────────────────────────────

function WhatsAppBubble({ text, side }: { text: string; side: 'left' | 'right' }) {
  return (
    <div className={cn('flex', side === 'right' ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
        side === 'right'
          ? 'bg-[#dcf8c6] text-gray-900 rounded-tr-sm'
          : 'bg-white text-gray-900 shadow-sm rounded-tl-sm'
      )}>
        {text}
      </div>
    </div>
  );
}

function FlowPreview({ settings }: { settings: CaptacionSettings }) {
  const enabledQs = settings.questions
    .filter(q => q.enabled)
    .sort((a, b) => a.order - b.order);

  const bubbles: { text: string; side: 'left' | 'right' }[] = [
    { text: 'Hola, quiero vender mi departamento', side: 'right' },
    { text: settings.greeting_message, side: 'left' },
    ...enabledQs.flatMap(q => {
      const qText = q.type === 'choice' && q.options?.length
        ? `${q.question}\n\n${q.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
        : q.question;
      return [
        { text: qText, side: 'left' as const },
        { text: '[Respuesta del cliente]', side: 'right' as const },
      ];
    }),
    { text: settings.completion_message, side: 'left' },
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-sm">
      <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
          {settings.agent_name.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-semibold">{settings.agent_name}</p>
          <p className="text-[10px] text-green-200">en línea</p>
        </div>
      </div>
      <div className="p-3 space-y-2 overflow-y-auto" style={{ background: '#ece5dd', maxHeight: 420 }}>
        {bubbles.map((b, i) => <WhatsAppBubble key={i} text={b.text} side={b.side} />)}
      </div>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────

export default function SettingsCaptacionAgent() {
  const { data: loaded, isLoading } = useCaptacionSettings();
  const update = useUpdateCaptacionSettings();

  const [draft, setDraft] = useState<CaptacionSettings | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<CaptacionQuestion | null>(null);
  const [isNewQuestion, setIsNewQuestion] = useState(false);

  useEffect(() => {
    if (loaded && !draft) setDraft(loaded);
  }, [loaded, draft]);

  if (isLoading || !draft) {
    return (
      <SettingsLayout title="Agente de Captación" description="Flujo automático de calificación de vendedores" icon={Home}>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SettingsLayout>
    );
  }

  const set = (patch: Partial<CaptacionSettings>) =>
    setDraft(d => d ? { ...d, ...patch } : d);

  const sortedQuestions = [...draft.questions].sort((a, b) => a.order - b.order);

  const moveQuestion = (id: string, dir: -1 | 1) => {
    const sorted = [...draft.questions].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(q => q.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    set({
      questions: sorted.map((q, i) => {
        if (i === idx) return { ...q, order: sorted[swapIdx].order };
        if (i === swapIdx) return { ...q, order: sorted[idx].order };
        return q;
      }),
    });
  };

  const toggleQuestion = (id: string) =>
    set({ questions: draft.questions.map(q => q.id === id ? { ...q, enabled: !q.enabled } : q) });

  const deleteQuestion = (id: string) =>
    set({ questions: draft.questions.filter(q => q.id !== id) });

  const openNewQuestion = () => {
    const maxOrder = draft.questions.length > 0 ? Math.max(...draft.questions.map(q => q.order)) + 1 : 0;
    setEditingQuestion(newQuestion(maxOrder));
    setIsNewQuestion(true);
  };

  const saveQuestion = (q: CaptacionQuestion) => {
    set({
      questions: isNewQuestion
        ? [...draft.questions, q]
        : draft.questions.map(existing => existing.id === q.id ? q : existing),
    });
    setEditingQuestion(null);
    setIsNewQuestion(false);
  };

  const handleSave = () => update.mutate(draft);

  const enabledCount = draft.questions.filter(q => q.enabled).length;

  return (
    <SettingsLayout
      title="Agente de Captación"
      description="Flujo automático de calificación de vendedores por WhatsApp"
      icon={Home}
    >
      <div className="space-y-6 max-w-4xl">

        {/* Master toggle — same pattern as Agente de Calificación */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Agente de Captación</CardTitle>
                  <CardDescription>
                    {draft.enabled
                      ? 'El agente está activo y ejecutará el cuestionario al detectar intención de venta'
                      : 'El agente está desactivado — los mensajes de vendedores se escalan directamente'}
                  </CardDescription>
                </div>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={v => set({ enabled: v })}
                disabled={update.isPending}
              />
            </div>
          </CardHeader>
        </Card>

        {/* Tabs — grid layout with icons, matching SettingsAIConfig */}
        <Tabs defaultValue="identidad" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="identidad">
              <UserCog className="h-4 w-4 mr-1.5" />
              Identidad
            </TabsTrigger>
            <TabsTrigger value="cuestionario">
              <ListChecks className="h-4 w-4 mr-1.5" />
              Cuestionario
              {enabledCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
                  {enabledCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mensajes">
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Mensajes
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Vista previa
            </TabsTrigger>
          </TabsList>

          {/* TAB 1 — Identidad */}
          <TabsContent value="identidad" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Identidad del agente</CardTitle>
                <CardDescription>Cómo se presenta el agente al vendedor en WhatsApp</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre del agente</Label>
                    <Input
                      value={draft.agent_name}
                      onChange={e => set({ agent_name: e.target.value })}
                      placeholder="Sofía"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Operaciones que cubre</Label>
                    <Select value={draft.operation_focus} onValueChange={v => set({ operation_focus: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATION_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  Escalación automática
                </CardTitle>
                <CardDescription>Qué ocurre cuando el cuestionario se completa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ToggleRow
                  label="Escalar a asesor humano al terminar"
                  desc="El agente notifica al equipo y marca la conversación como pendiente de atención"
                  checked={draft.auto_escalate}
                  onChange={v => set({ auto_escalate: v })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2 — Cuestionario */}
          <TabsContent value="cuestionario" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Preguntas del cuestionario</CardTitle>
                    <CardDescription>
                      {enabledCount} de {draft.questions.length} preguntas activas. El agente las hace en orden, una por mensaje.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => set({ questions: DEFAULT_CAPTACION_QUESTIONS })}>
                      Restaurar
                    </Button>
                    <Button size="sm" onClick={openNewQuestion}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Nueva pregunta
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-lg border transition-colors',
                      q.enabled ? 'bg-card' : 'bg-muted/30 opacity-60'
                    )}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                    {/* up/down */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => moveQuestion(q.id, -1)}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === sortedQuestions.length - 1} onClick={() => moveQuestion(q.id, 1)}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{q.label || '(sin etiqueta)'}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                          {QUESTION_TYPE_LABELS[q.type]}
                        </Badge>
                        {q.required && (
                          <Badge variant="outline" className="text-[10px] px-1.5 shrink-0 text-amber-400 border-amber-400/30">
                            Obligatoria
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{q.question}</p>
                    </div>

                    {/* actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={q.enabled} onCheckedChange={() => toggleQuestion(q.id)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => { setIsNewQuestion(false); setEditingQuestion(q); }}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteQuestion(q.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                {draft.questions.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    <p className="text-sm">No hay preguntas configuradas.</p>
                    <Button className="mt-3" variant="outline" size="sm" onClick={openNewQuestion}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Añadir primera pregunta
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3 — Mensajes */}
          <TabsContent value="mensajes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Mensaje de bienvenida</CardTitle>
                <CardDescription>
                  Primera respuesta cuando el agente detecta intención de vender. Se envía antes de la primera pregunta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  value={draft.greeting_message}
                  onChange={e => set({ greeting_message: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-2">{draft.greeting_message.length} caracteres</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mensaje de cierre</CardTitle>
                <CardDescription>
                  Se envía cuando el contacto ha respondido todas las preguntas habilitadas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  value={draft.completion_message}
                  onChange={e => set({ completion_message: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-2">{draft.completion_message.length} caracteres</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Nota de escalación</CardTitle>
                <CardDescription>
                  Contexto interno para el asesor que recibe la conversación escalada (no se envía al cliente).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={3}
                  value={draft.handoff_message}
                  onChange={e => set({ handoff_message: e.target.value })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4 — Vista previa */}
          <TabsContent value="preview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Simulación del flujo</CardTitle>
                  <CardDescription>
                    Así verá el vendedor la conversación con {draft.agent_name} en WhatsApp
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FlowPreview settings={draft} />
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Resumen del flujo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { step: 1, color: 'emerald', text: 'Contacto envía mensaje con intención de vender' },
                      { step: 2, color: 'blue', text: 'Dispatcher clasifica como Captación' },
                      { step: 3, color: 'purple', text: `${draft.agent_name} envía saludo + ${enabledCount} pregunta${enabledCount !== 1 ? 's' : ''}` },
                      { step: 4, color: 'amber', text: 'Respuestas guardadas en campos del contacto' },
                      ...(draft.auto_escalate ? [{ step: 5, color: 'red', text: 'Escalación automática a asesor humano' }] : []),
                    ].map(({ step, color, text }) => (
                      <div key={step} className="flex items-center gap-3 text-sm">
                        <div className={`w-6 h-6 rounded-full bg-${color}-500/20 text-${color}-500 text-xs font-bold flex items-center justify-center shrink-0`}>
                          {step}
                        </div>
                        <span className="text-muted-foreground">{text}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Preguntas activas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sortedQuestions.filter(q => q.enabled).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Ninguna pregunta habilitada.</p>
                    ) : (
                      <div className="space-y-2">
                        {sortedQuestions.filter(q => q.enabled).map((q, i) => (
                          <div key={q.id} className="flex items-center gap-3 p-3 rounded-lg border text-sm">
                            <span className="font-mono text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                            <span className="flex-1 truncate">{q.label}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                              {QUESTION_TYPE_LABELS[q.type]}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Sticky save footer — same as SettingsAIConfig */}
        <div className="flex justify-end pt-4 border-t sticky bottom-0 bg-background py-3">
          <Button onClick={handleSave} disabled={update.isPending} size="lg">
            {update.isPending ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </div>
      </div>

      <QuestionEditorDialog
        question={editingQuestion}
        onSave={saveQuestion}
        onClose={() => { setEditingQuestion(null); setIsNewQuestion(false); }}
      />
    </SettingsLayout>
  );
}
