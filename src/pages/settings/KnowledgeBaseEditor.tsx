import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, ToggleLeft, ToggleRight, Tag, BookOpen, MessageSquare, Info, Link2, FileText, Upload, X, ChevronsUpDown, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';
import {
  useKnowledgeBase,
  useKBCollections,
  useCreateKBEntry,
  useUpdateKBEntry,
  KBEntryType,
  KB_ENTRY_TYPE_LABELS,
} from '@/hooks/useKnowledgeBase';

const ENTRY_TYPES: { value: KBEntryType; icon: React.ElementType; label: string; desc: string }[] = [
  { value: 'qa', icon: MessageSquare, label: 'Q&A', desc: 'Pregunta y respuesta' },
  { value: 'info', icon: Info, label: 'Info', desc: 'Bloque de conocimiento' },
  { value: 'url', icon: Link2, label: 'URL', desc: 'Enlace externo' },
  { value: 'file', icon: FileText, label: 'Archivo', desc: 'PDF o imagen' },
];

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png,image/webp,image/gif,.docx';

export default function KnowledgeBaseEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditing = !!id;
  const tenantId = useEffectiveTenantId();

  const { data: entries = [], isLoading } = useKnowledgeBase();
  const { data: collections = [] } = useKBCollections();
  const createEntry = useCreateKBEntry();
  const updateEntry = useUpdateKBEntry();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [entryType, setEntryType] = useState<KBEntryType>('qa');
  const [formData, setFormData] = useState({
    collection: searchParams.get('collection') || 'general',
    question: '',
    answer: '',
    url: '',
    file_url: '',
    file_name: '',
    media_type: '',
    tags: [] as string[],
    is_active: true,
  });
  const [tagInput, setTagInput] = useState('');
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState('');

  // Todas las colecciones: las de la tabla kb_collections + las que solo existen
  // como valor `collection` en entradas (igual que la lista de la base de conocimiento).
  const allCollectionNames = useMemo(() => {
    const names = [
      ...collections.map(c => c.name),
      ...entries.map(e => e.collection || 'general'),
      'general',
    ];
    return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [collections, entries]);

  const collectionQuery = collectionSearch.trim();
  const filteredCollections = collectionQuery
    ? allCollectionNames.filter(n => n.toLowerCase().includes(collectionQuery.toLowerCase()))
    : allCollectionNames;
  const showCreateCollection =
    !!collectionQuery && !allCollectionNames.some(n => n.toLowerCase() === collectionQuery.toLowerCase());

  useEffect(() => {
    if (isEditing && entries.length > 0) {
      const entry = entries.find(e => e.id === id);
      if (entry) {
        setEntryType((entry.entry_type as KBEntryType) || 'qa');
        setFormData({
          collection: entry.collection || 'general',
          question: entry.question || '',
          answer: entry.answer || '',
          url: entry.url || '',
          file_url: entry.file_url || '',
          file_name: entry.file_name || '',
          media_type: entry.media_type || '',
          tags: entry.tags || [],
          is_active: entry.is_active,
        });
      }
    }
  }, [id, isEditing, entries]);

  function patch<K extends keyof typeof formData>(key: K, val: typeof formData[K]) {
    setFormData(prev => ({ ...prev, [key]: val }));
  }

  // Cambio de tipo iniciado por el usuario: reinicia el contenido para que no
  // se arrastre texto de un tipo a otro (no se usa en la carga inicial).
  function handleTypeChange(value: KBEntryType) {
    if (value === entryType) return;
    setEntryType(value);
    setFormData(prev => ({ ...prev, answer: '' }));
  }

  function handleAddTag() {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      patch('tags', [...formData.tags, tagInput.trim()]);
      setTagInput('');
    }
  }

  async function handleFileUpload(file: File) {
    if (!tenantId) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('kb-files').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('kb-files').getPublicUrl(path);
      patch('file_url', urlData.publicUrl);
      patch('file_name', file.name);
      patch('media_type', file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'docx');
      if (!formData.question) patch('question', file.name.replace(/\.[^/.]+$/, ''));
      toast.success('Archivo subido');
    } catch (err) {
      toast.error('Error al subir archivo', { description: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  async function handleSave() {
    const question = formData.question.trim() || (entryType === 'url' ? formData.url : formData.file_name) || '(sin título)';
    const payload = {
      category: 'general_info' as const,
      collection: formData.collection.trim() || 'general',
      entry_type: entryType,
      question,
      answer: formData.answer.trim(),
      url: formData.url.trim() || null,
      file_url: formData.file_url || null,
      file_name: formData.file_name || null,
      media_type: formData.media_type || null,
      tags: formData.tags,
      is_active: formData.is_active,
    };

    if (isEditing) {
      updateEntry.mutate({ id, ...payload }, { onSuccess: () => navigate('/settings/knowledge-base') });
    } else {
      createEntry.mutate(payload, { onSuccess: () => navigate('/settings/knowledge-base') });
    }
  }

  const isSaving = createEntry.isPending || updateEntry.isPending;
  const canSave = (entryType === 'qa' ? !!formData.answer.trim() : true) && !uploading;

  if (isLoading && isEditing) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings/knowledge-base')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              {isEditing ? 'Editar entrada' : 'Nueva entrada'}
            </h1>
            <p className="text-sm text-muted-foreground">{KB_ENTRY_TYPE_LABELS[entryType]}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={!canSave || isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear entrada'}
        </Button>
      </div>

      {/* Entry type selector */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {ENTRY_TYPES.map(({ value, icon: Icon, label, desc }) => {
          const active = entryType === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleTypeChange(value)}
              className={`text-left p-3 rounded-xl border-2 transition-all ${active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
            >
              <Icon className={`h-5 w-5 mb-1.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className={`text-sm font-semibold ${active ? 'text-primary' : ''}`}>{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Metadata */}
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">Configuración</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Collection */}
              <div className="space-y-1.5">
                <Label>Colección</Label>
                <Popover open={collectionOpen} onOpenChange={setCollectionOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={collectionOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className={cn("truncate", !formData.collection && "text-muted-foreground")}>
                        {formData.collection || 'Selecciona o crea una colección'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar o crear colección…"
                        value={collectionSearch}
                        onValueChange={setCollectionSearch}
                      />
                      <CommandList>
                        {filteredCollections.length === 0 && !showCreateCollection && (
                          <CommandEmpty>Sin colecciones</CommandEmpty>
                        )}
                        <CommandGroup>
                          {filteredCollections.map(name => (
                            <CommandItem
                              key={name}
                              value={name}
                              onSelect={() => {
                                patch('collection', name);
                                setCollectionSearch('');
                                setCollectionOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.collection === name ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {name}
                            </CommandItem>
                          ))}
                          {showCreateCollection && (
                            <CommandItem
                              value={`__create__${collectionQuery}`}
                              onSelect={() => {
                                patch('collection', collectionQuery);
                                setCollectionSearch('');
                                setCollectionOpen(false);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Crear «{collectionQuery}»
                            </CommandItem>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">Elige una colección existente o escribe para crear una nueva</p>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Card className="p-3 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{formData.is_active ? 'Activo' : 'Inactivo'}</p>
                      <p className="text-xs text-muted-foreground">{formData.is_active ? 'La IA usará esta entrada' : 'La IA ignorará esta entrada'}</p>
                    </div>
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={() => patch('is_active', !formData.is_active)}
                      className={formData.is_active ? 'text-green-500' : 'text-muted-foreground'}
                    >
                      {formData.is_active ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8" />}
                    </Button>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader><CardTitle className="text-base">Etiquetas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Nueva etiqueta"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                  <Tag className="h-4 w-4" />
                </Button>
              </div>
              {formData.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {formData.tags.map((tag) => (
                    <Badge
                      key={tag} variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      onClick={() => patch('tags', formData.tags.filter(t => t !== tag))}
                    >
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Las etiquetas ayudan a organizar y buscar</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Content */}
        <div className="lg:col-span-2 space-y-5">

          {/* Title / Question */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {entryType === 'qa' ? 'Pregunta' : 'Título'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={formData.question}
                onChange={(e) => patch('question', e.target.value)}
                placeholder={
                  entryType === 'qa' ? '¿Cuál es la pregunta que el cliente haría?' :
                  entryType === 'info' ? 'Título del bloque (ej: Descripción de Nexus)' :
                  entryType === 'url' ? 'Nombre del recurso (ej: Video de demo)' :
                  'Nombre del documento (ej: Catálogo de productos)'
                }
                className="text-base"
              />
            </CardContent>
          </Card>

          {/* URL field (for url + file types) */}
          {(entryType === 'url' || entryType === 'file') && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  {entryType === 'url' ? 'URL del recurso' : 'URL del archivo (opcional)'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  type="url"
                  value={formData.url}
                  onChange={(e) => patch('url', e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {entryType === 'url'
                    ? 'La IA mencionará esta URL cuando sea relevante'
                    : 'Enlace externo relacionado (opcional)'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* File upload (for file type) */}
          {entryType === 'file' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Subir archivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {formData.file_url ? (
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                    <FileText className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{formData.file_name}</p>
                      <p className="text-xs text-muted-foreground">Archivo subido</p>
                    </div>
                    <Button
                      size="icon" variant="ghost"
                      onClick={() => { patch('file_url', ''); patch('file_name', ''); patch('media_type', ''); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">{uploading ? 'Subiendo…' : 'Arrastra un archivo o haz clic'}</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, imagen, DOCX — máx. 50 MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_TYPES}
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Answer / Description */}
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-base">
                {entryType === 'qa' ? 'Respuesta' :
                 entryType === 'file' ? 'Descripción del contenido (para la IA)' :
                 'Descripción / Contenido'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.answer}
                onChange={(e) => patch('answer', e.target.value)}
                placeholder={
                  entryType === 'qa'
                    ? 'Escribe la respuesta detallada que la IA debe dar. Entre más completa, mejor responde la IA.'
                    : entryType === 'file'
                    ? 'Describe qué contiene el archivo. La IA usa esta descripción de texto, no el archivo directamente.\n\nEj: Este PDF contiene el catálogo completo de Nexus con precios, especificaciones técnicas y planes de servicio para 2025.'
                    : entryType === 'url'
                    ? 'Describe qué encontrará el visitante en esa URL. La IA mencionará el link cuando el usuario pregunte sobre este tema.'
                    : 'Escribe aquí el bloque de información completo. La IA lo usará como contexto cuando el usuario pregunte sobre este tema.'
                }
                className="min-h-[300px] resize-none text-base leading-relaxed"
              />
              {entryType === 'file' && (
                <p className="text-xs text-muted-foreground mt-2">
                  El AI no puede leer el archivo directamente. Tu descripción es lo que aprende.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
