import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Search, Edit, Trash2, ToggleLeft, ToggleRight, Tag, FolderPlus, Folder, Link2, FileText, MessageSquare, Info, Globe } from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  useKnowledgeBase,
  useDeleteKBEntry,
  useToggleKBEntry,
  useKBCollections,
  useCreateKBCollection,
  useDeleteKBCollection,
  KnowledgeBaseEntry,
  KBEntryType,
} from '@/hooks/useKnowledgeBase';

const ENTRY_TYPE_ICONS: Record<KBEntryType, React.ElementType> = {
  qa: MessageSquare,
  info: Info,
  url: Link2,
  file: FileText,
};

const ENTRY_TYPE_LABELS: Record<KBEntryType, string> = {
  qa: 'Q&A',
  info: 'Info',
  url: 'URL',
  file: 'Archivo',
};

const DEFAULT_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899'];
const DEFAULT_ICONS = ['📁','📦','🚀','⚡','💡','🎯','🔧','📊'];

export default function SettingsKnowledgeBase() {
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = useKnowledgeBase();
  const { data: collections = [] } = useKBCollections();
  const deleteEntry = useDeleteKBEntry();
  const toggleEntry = useToggleKBEntry();
  const createCollection = useCreateKBCollection();
  const deleteCollection = useDeleteKBCollection();

  const [search, setSearch] = useState('');
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteColId, setDeleteColId] = useState<string | null>(null);
  const [showNewCol, setShowNewCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColIcon, setNewColIcon] = useState('📁');
  const [newColColor, setNewColColor] = useState('#6366F1');

  // Derive unique collections from entries (includes ones not in kb_collections yet)
  const entryCollections = [...new Set(entries.map(e => e.collection || 'general'))];
  const allCollectionNames = [...new Set([...collections.map(c => c.name), ...entryCollections])];

  const filteredEntries = entries.filter((entry) => {
    const col = entry.collection || 'general';
    const matchesCollection = activeCollection === null || col === activeCollection;
    const matchesSearch =
      !search ||
      entry.question.toLowerCase().includes(search.toLowerCase()) ||
      entry.answer.toLowerCase().includes(search.toLowerCase());
    return matchesCollection && matchesSearch;
  });

  const countByCollection = (name: string) =>
    entries.filter(e => (e.collection || 'general') === name).length;

  function handleCreateCollection() {
    if (!newColName.trim()) return;
    createCollection.mutate(
      { name: newColName.trim(), description: '', icon: newColIcon, color: newColColor },
      {
        onSuccess: () => {
          setActiveCollection(newColName.trim());
          setNewColName('');
          setShowNewCol(false);
        },
      }
    );
  }

  if (isLoading) {
    return (
      <SettingsLayout title="Base de Conocimiento" description="Gestiona las respuestas del asistente" icon={BookOpen}>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Base de Conocimiento" description="Gestiona las respuestas del asistente" icon={BookOpen}>
      <div className="flex gap-6">

        {/* ── Sidebar: Collections ───────────────────────────────────────── */}
        <div className="w-56 shrink-0 space-y-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colecciones</p>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowNewCol(!showNewCol)} title="Nueva colección">
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* New collection inline form */}
          {showNewCol && (
            <Card className="p-3 mb-2 space-y-2">
              <div className="flex gap-2">
                <button
                  className="text-xl w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => {
                    const next = DEFAULT_ICONS[(DEFAULT_ICONS.indexOf(newColIcon) + 1) % DEFAULT_ICONS.length];
                    setNewColIcon(next);
                  }}
                  title="Cambiar ícono"
                  type="button"
                >
                  {newColIcon}
                </button>
                <Input
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="Nombre..."
                  className="h-9 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                  autoFocus
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColColor(c)}
                    className={`w-5 h-5 rounded-full transition-transform ${newColColor === c ? 'scale-125 ring-2 ring-offset-1 ring-foreground/30' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreateCollection} disabled={!newColName.trim() || createCollection.isPending}>
                  Crear
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowNewCol(false); setNewColName(''); }}>
                  Cancelar
                </Button>
              </div>
            </Card>
          )}

          {/* All entries */}
          <button
            onClick={() => setActiveCollection(null)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${activeCollection === null ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left font-medium">Todas</span>
            <Badge variant={activeCollection === null ? 'secondary' : 'outline'} className="text-xs h-5">
              {entries.length}
            </Badge>
          </button>

          {/* Per-collection buttons */}
          {allCollectionNames.map((name) => {
            const col = collections.find(c => c.name === name);
            const icon = col?.icon || '📁';
            const color = col?.color || '#6366F1';
            const isActive = activeCollection === name;
            return (
              <div key={name} className="group relative">
                <button
                  onClick={() => setActiveCollection(name)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}
                >
                  <span className="text-base shrink-0">{icon}</span>
                  <span className="flex-1 text-left font-medium truncate">{name}</span>
                  <Badge variant={isActive ? 'secondary' : 'outline'} className="text-xs h-5 shrink-0">
                    {countByCollection(name)}
                  </Badge>
                </button>
                {col && (
                  <button
                    className="absolute right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteColId(col.id)}
                    title="Eliminar colección"
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="secondary" className="text-sm">{entries.length} entradas</Badge>
              <Badge variant="outline" className="text-sm">{entries.filter(e => e.is_active).length} activas</Badge>
            </div>
            <Button onClick={() => navigate(`/settings/knowledge-base/new${activeCollection ? `?collection=${encodeURIComponent(activeCollection)}` : ''}`)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva entrada
            </Button>
          </div>

          {/* Entries */}
          {filteredEntries.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {search ? 'No hay resultados para tu búsqueda' : 'Sin entradas en esta colección'}
                </p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/settings/knowledge-base/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear primera entrada
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => {
                const TypeIcon = ENTRY_TYPE_ICONS[entry.entry_type as KBEntryType] || MessageSquare;
                return (
                  <Card
                    key={entry.id}
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${!entry.is_active ? 'opacity-55' : ''}`}
                    onClick={() => navigate(`/settings/knowledge-base/${entry.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-0.5">
                          <TypeIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-medium text-foreground truncate">{entry.question}</p>
                            {entry.entry_type !== 'qa' && (
                              <Badge variant="secondary" className="text-[10px] h-4 shrink-0">
                                {ENTRY_TYPE_LABELS[entry.entry_type as KBEntryType]}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{entry.answer}</p>
                          {entry.url && (
                            <p className="text-xs text-primary mt-1 truncate">{entry.url}</p>
                          )}
                          {entry.file_name && (
                            <p className="text-xs text-muted-foreground mt-1">📎 {entry.file_name}</p>
                          )}
                          {entry.tags && entry.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {entry.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  <Tag className="h-3 w-3 mr-1" />
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => toggleEntry.mutate({ id: entry.id, is_active: !entry.is_active })} title={entry.is_active ? 'Desactivar' : 'Activar'}>
                            {entry.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/settings/knowledge-base/${entry.id}`)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(entry.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Entry */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar entrada?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) { deleteEntry.mutate(deleteId); setDeleteId(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Collection */}
      <AlertDialog open={!!deleteColId} onOpenChange={() => setDeleteColId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar colección?</AlertDialogTitle>
            <AlertDialogDescription>Las entradas no se eliminan, solo la colección. Las entradas quedarán sin colección asignada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteColId) { deleteCollection.mutate(deleteColId); setDeleteColId(null); setActiveCollection(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar colección
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}
