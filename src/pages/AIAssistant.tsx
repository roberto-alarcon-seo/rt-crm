import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Plus,
  Search,
  Send,
  Paperclip,
  Mic,
  BarChart2,
  Users,
  TrendingUp,
  CalendarDays,
  MessageSquare,
  ChevronRight,
  Bot,
  Loader2,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Menu,
  X,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAIConversations } from "@/hooks/useAIConversations";
import { useAIMessages } from "@/hooks/useAIMessages";
import { useSendAIMessage } from "@/hooks/useSendAIMessage";
import { useExecuteAIAction } from "@/hooks/useExecuteAIAction";
import { useAIMessageFeedback } from "@/hooks/useAIMessageFeedback";
import { useMarkConversationRead } from "@/hooks/useMarkConversationRead";
import { MessageRenderer } from "@/components/ai/MessageRenderer";

// ─── Types ───────────────────────────────────────────────────────

type QuickAction = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  prompt: string;
  color: string;
};

// ─── Quick actions ────────────────────────────────────────────────

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: BarChart2,
    label: "Reporte de productividad",
    description: "Resumen semanal del equipo con métricas clave",
    prompt: "Genera un reporte de productividad del equipo esta semana",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  },
  {
    icon: Users,
    label: "Leads sin respuesta",
    description: "Detectar contactos que llevan días sin atención",
    prompt: "¿Cuáles leads llevan más de 48 horas sin respuesta?",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    icon: TrendingUp,
    label: "Análisis de conversión",
    description: "Tasa de cierre por asesor y por etapa del pipeline",
    prompt: "Muéstrame la tasa de conversión del pipeline este mes",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: CalendarDays,
    label: "Citas agendadas hoy",
    description: "Resumen de visitas y citas del día",
    prompt: "¿Cuántas citas hay agendadas para hoy?",
    color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  },
  {
    icon: MessageSquare,
    label: "Campañas activas",
    description: "Estado y resultados de las campañas en curso",
    prompt: "Dame un resumen de las campañas activas esta semana",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  },
  {
    icon: BarChart2,
    label: "Seguimientos vencidos",
    description: "Lista de seguimientos que superaron el plazo",
    prompt: "¿Qué seguimientos llevan más de 72 horas sin acción?",
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins} min`;
  if (hours < 24) return `${hours} h`;
  if (days === 1) return "Ayer";
  if (days < 7) return `${days} días`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

// ─── Conversation sidebar ─────────────────────────────────────────

function ConversationSidebar({
  activeId,
  onSelect,
  onNew,
  onClose,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose?: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data: conversations = [], isLoading } = useAIConversations();

  const filtered = conversations.filter((c) =>
    (c.title ?? "Nueva conversación").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="w-64 shrink-0 border-r border-border flex flex-col h-full bg-card">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">RT IA Studio</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onNew}
            title="Nueva conversación"
          >
            <Plus className="w-4 h-4" />
          </Button>
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground md:hidden"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-muted/40 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {search ? "Sin resultados" : "Sin conversaciones"}
            </p>
          ) : (
            <>
              {/* Conversaciones de sistema (alertas proactivas) */}
              {filtered.filter(c => c.conversation_type === 'system').map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => { onSelect(conv.id); onClose?.(); }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors hover:bg-accent/50 border-l-2",
                    activeId === conv.id
                      ? "border-amber-500 bg-accent/60"
                      : "border-amber-500/40"
                  )}
                >
                  <Bell className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", conv.unread ? "text-amber-400" : "text-muted-foreground")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-xs truncate flex-1", conv.unread ? "font-semibold" : "font-medium")}>
                        {conv.title ?? "Alertas"}
                      </span>
                      {conv.unread && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{relativeTime(conv.updated_at)}</span>
                  </div>
                </button>
              ))}

              {/* Separador si hay conversaciones de sistema */}
              {filtered.some(c => c.conversation_type === 'system') && filtered.some(c => c.conversation_type === 'user') && (
                <div className="mx-3 my-1 border-t border-border/50" />
              )}

              {/* Conversaciones de usuario */}
              {filtered.filter(c => c.conversation_type !== 'system').map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => { onSelect(conv.id); onClose?.(); }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 flex flex-col gap-0.5 transition-colors hover:bg-accent/50 border-l-2",
                    activeId === conv.id
                      ? "border-violet-500 bg-accent/60"
                      : "border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate flex-1">
                      {conv.title ?? "Nueva conversación"}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {relativeTime(conv.updated_at)}
                    </span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

// ─── Welcome state ────────────────────────────────────────────────

function WelcomeState({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-8 overflow-auto">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">¿En qué te ayudo hoy?</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Soy tu asistente de inteligencia artificial. Puedo generar reportes,
            analizar tu pipeline, detectar oportunidades y mucho más.
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => onPrompt(action.prompt)}
            className={cn(
              "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all hover:scale-[1.02] hover:shadow-md",
              action.color
            )}
          >
            <action.icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">{action.label}</p>
              <p className="text-[11px] opacity-70 mt-0.5 leading-relaxed">{action.description}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 opacity-40 shrink-0 self-center ml-auto" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message list ─────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handle}
      className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function FeedbackButtons({
  messageId,
  currentFeedback,
  conversationId,
}: {
  messageId: string;
  currentFeedback?: string | null;
  conversationId: string | null;
}) {
  const feedback = useAIMessageFeedback(conversationId);
  const toggle = (value: 'positive' | 'negative') => {
    feedback.mutate({ messageId, feedback: currentFeedback === value ? null : value });
  };
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => toggle('positive')}
        className={cn(
          "p-1 rounded transition-colors",
          currentFeedback === 'positive'
            ? "text-emerald-400"
            : "text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10"
        )}
        title="Útil"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => toggle('negative')}
        className={cn(
          "p-1 rounded transition-colors",
          currentFeedback === 'negative'
            ? "text-red-400"
            : "text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10"
        )}
        title="No útil"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function MessageList({
  conversationId,
  isSending,
  onExecuteAction,
  confirmedMessageIds,
  onMessageConfirmed,
}: {
  conversationId: string | null;
  isSending: boolean;
  onExecuteAction: (tool: string, params: Record<string, unknown>) => Promise<void>;
  confirmedMessageIds: Set<string>;
  onMessageConfirmed: (id: string) => void;
}) {
  const { data: messages = [], isLoading } = useAIMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (messages.length === 0 && !isSending) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <Bot className="w-8 h-8 opacity-20" />
          <p>Escribe tu primera pregunta</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 p-4 md:p-5 max-w-3xl mx-auto">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const contentType = (msg.content as any)?.type;
          const contentText = (msg.content as any)?.text ?? "";
          const isConfirmed = confirmedMessageIds.has(msg.id);

          return (
            <div
              key={msg.id}
              className={cn("flex items-end gap-2 group", isUser ? "justify-end" : "justify-start")}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0 self-start mt-1">
                  <Bot className="w-3.5 h-3.5 text-violet-400" />
                </div>
              )}
              {isUser ? (
                <div className="max-w-[85%] md:max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed bg-violet-600 text-white">
                  <p className="whitespace-pre-wrap">{contentText}</p>
                </div>
              ) : (
                <div className="max-w-[92%] md:max-w-[80%] flex flex-col gap-1 min-w-0">
                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-muted text-foreground">
                    <MessageRenderer
                      content={
                        contentType === 'action-confirm' && isConfirmed
                          ? { ...(msg.content as any), data: { ...(msg.content as any).data, confirmed: true } }
                          : msg.content
                      }
                      onConfirmAction={async () => {
                        const pending = (msg.content as any)?.data?.pendingAction;
                        if (!pending?.tool) return;
                        await onExecuteAction(pending.tool, pending.params ?? {});
                        onMessageConfirmed(msg.id);
                      }}
                      onCancelAction={() => {}}
                    />
                  </div>
                  {contentType !== 'loading' && contentType !== 'action-confirm' && (
                    <div className="flex items-center gap-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity [.group:hover_&]:opacity-100">
                      {contentText && <CopyButton text={contentText} />}
                      <FeedbackButtons
                        messageId={msg.id}
                        currentFeedback={(msg as any).feedback}
                        conversationId={conversationId}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-end gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

// ─── Main page ────────────────────────────────────────────────────

export default function AIAssistant() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmedMessageIds, setConfirmedMessageIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useSendAIMessage();
  const executeAction = useExecuteAIAction();
  const markRead = useMarkConversationRead();
  const isSending = sendMessage.isPending;

  const handleMessageConfirmed = useCallback((id: string) => {
    setConfirmedMessageIds(prev => new Set(prev).add(id));
  }, []);

  const handleNew = () => { setActiveConversationId(null); setSidebarOpen(false); };
  const handleSelect = (id: string) => {
    setActiveConversationId(id);
    setSidebarOpen(false);
    markRead.mutate(id);
  };

  const handlePrompt = (text: string) => {
    setInputValue(text);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    const prompt = inputValue.trim();
    if (!prompt || isSending) return;

    // Si es nueva conversación y no hay una activa, limpiar input primero
    setInputValue("");

    const result = await sendMessage.mutateAsync({
      prompt,
      conversationId: activeConversationId,
    }).catch(() => null);

    if (result && result.conversation_id !== activeConversationId) {
      setActiveConversationId(result.conversation_id);
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  };

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-30 md:static md:z-auto md:flex md:shrink-0 transition-transform duration-200",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <ConversationSidebar
          activeId={activeConversationId}
          onSelect={handleSelect}
          onNew={handleNew}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
          <button
            type="button"
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <Bot className="w-4 h-4 text-violet-400 hidden md:block" />
          <span className="text-sm font-medium">
            {activeConversationId ? "Conversación" : "Nueva conversación"}
          </span>
        </div>

        {/* Content */}
        {activeConversationId === null && !isSending ? (
          <WelcomeState onPrompt={handlePrompt} />
        ) : activeConversationId === null && isSending ? (
          // Primera vez que se envía un mensaje — todavía no tenemos conversationId
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
            </div>
            <p className="text-xs text-muted-foreground">Procesando tu consulta...</p>
          </div>
        ) : (
          <MessageList
            conversationId={activeConversationId}
            isSending={isSending}
            confirmedMessageIds={confirmedMessageIds}
            onMessageConfirmed={handleMessageConfirmed}
            onExecuteAction={async (tool, params) => {
              if (!activeConversationId) return;
              await executeAction.mutateAsync({ conversationId: activeConversationId, tool, params });
            }}
          />
        )}

        {/* Input */}
        <div className="border-t border-border p-4 shrink-0">
          <div className="relative flex items-end gap-2 bg-muted/40 border border-border rounded-xl px-4 py-2.5 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 self-center"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Escribe tu pregunta o selecciona una opción de arriba..."
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isSending}
              className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/60 max-h-32 py-0.5 leading-relaxed disabled:opacity-50"
              style={{ height: "auto" }}
            />
            <div className="flex items-center gap-1 shrink-0 self-center">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputValue.trim() || isSending}
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                  inputValue.trim() && !isSending
                    ? "bg-violet-600 hover:bg-violet-500 text-white"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {isSending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            El asistente puede cometer errores. Verifica información crítica antes de tomar decisiones.
          </p>
        </div>
      </div>
    </div>
  );
}
