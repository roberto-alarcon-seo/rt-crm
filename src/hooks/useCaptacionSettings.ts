import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export type QuestionType = 'open' | 'choice' | 'number';

export interface CaptacionQuestion {
  id: string;
  label: string;
  question: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  enabled: boolean;
  order: number;
}

export interface CaptacionSettings {
  id?: string;
  tenant_id?: string;
  enabled: boolean;
  agent_name: string;
  operation_focus: 'sale' | 'rent' | 'both';
  greeting_message: string;
  questions: CaptacionQuestion[];
  completion_message: string;
  handoff_message: string;
  auto_escalate: boolean;
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_CAPTACION_QUESTIONS: CaptacionQuestion[] = [
  {
    id: 'tipo_propiedad',
    label: 'Tipo de inmueble',
    question: '¿Qué tipo de inmueble deseas vender o rentar?',
    type: 'choice',
    options: ['Casa', 'Departamento', 'Local comercial', 'Terreno', 'Bodega', 'Otro'],
    required: true,
    enabled: true,
    order: 0,
  },
  {
    id: 'ubicacion',
    label: 'Ubicación',
    question: '¿En qué colonia o zona se encuentra el inmueble?',
    type: 'open',
    required: true,
    enabled: true,
    order: 1,
  },
  {
    id: 'caracteristicas',
    label: 'Características',
    question: '¿Cuántas recámaras y baños tiene? ¿Y cuántos metros cuadrados aproximadamente?',
    type: 'open',
    required: false,
    enabled: true,
    order: 2,
  },
  {
    id: 'estado',
    label: 'Estado del inmueble',
    question: '¿Cómo describirías el estado actual del inmueble?',
    type: 'choice',
    options: ['Excelente (como nuevo)', 'Bueno (bien conservado)', 'Regular (necesita arreglos)', 'Requiere remodelación'],
    required: false,
    enabled: true,
    order: 3,
  },
  {
    id: 'precio',
    label: 'Precio esperado',
    question: '¿Cuál es el precio que tienes en mente para tu inmueble?',
    type: 'open',
    required: false,
    enabled: true,
    order: 4,
  },
  {
    id: 'urgencia',
    label: 'Urgencia de venta',
    question: '¿En qué plazo necesitas concretar la operación?',
    type: 'choice',
    options: [
      'Lo antes posible (1-2 meses)',
      'En los próximos 3-6 meses',
      'Sin prisa, cuando aparezca el comprador ideal',
    ],
    required: false,
    enabled: true,
    order: 5,
  },
  {
    id: 'exclusividad',
    label: 'Exclusividad',
    question: '¿Estás trabajando actualmente con alguna otra inmobiliaria o agente?',
    type: 'choice',
    options: ['No, acabo de empezar', 'Sí, con otras opciones activas', 'Prefiero no comentarlo'],
    required: false,
    enabled: false,
    order: 6,
  },
];

export const DEFAULT_CAPTACION_SETTINGS: CaptacionSettings = {
  enabled: true,
  agent_name: 'Sofía',
  operation_focus: 'both',
  greeting_message:
    '¡Hola! Me da mucho gusto que nos contactes. Me gustaría conocer un poco más sobre tu inmueble para conectarte con el asesor ideal. ¿Me permites hacerte algunas preguntas? 🏡',
  questions: DEFAULT_CAPTACION_QUESTIONS,
  completion_message:
    '¡Excelente! Ya tenemos toda la información necesaria. Un asesor especializado en captación se pondrá en contacto contigo muy pronto. ¡Gracias por tu confianza! 🙌',
  handoff_message:
    'Ya registré los datos de tu inmueble. Un asesor te contactará a la brevedad para continuar el proceso.',
  auto_escalate: true,
};

export function useCaptacionSettings() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['captacion-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return DEFAULT_CAPTACION_SETTINGS;

      const { data, error } = await supabase
        .from('tenant_captacion_settings' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { ...DEFAULT_CAPTACION_SETTINGS };

      const row = data as any;
      return {
        ...DEFAULT_CAPTACION_SETTINGS,
        ...row,
        questions:
          Array.isArray(row.questions) && row.questions.length > 0
            ? (row.questions as CaptacionQuestion[])
            : DEFAULT_CAPTACION_QUESTIONS,
      } as CaptacionSettings;
    },
    enabled: !!tenantId,
  });
}

export function useUpdateCaptacionSettings() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (settings: Partial<CaptacionSettings>) => {
      if (!tenantId) throw new Error('No tenant');

      const { data: existing } = await supabase
        .from('tenant_captacion_settings' as any)
        .select('id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('tenant_captacion_settings' as any)
          .update({ ...settings, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tenant_captacion_settings' as any)
          .insert({ ...DEFAULT_CAPTACION_SETTINGS, ...settings, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captacion-settings'] });
      toast.success('Configuración guardada');
    },
    onError: (error: Error) => {
      toast.error('Error al guardar', { description: error.message });
    },
  });
}
