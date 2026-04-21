import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Api } from '../lib/api';
import { uploadImageToCloudinary } from '../lib/cloudinary';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import CategoryTreePicker from '../components/CategoryTreePicker';
import {
  type CategoryNode,
  flattenCategoryTree,
  getDescendantIds,
  sortCategoryNodes,
} from '../lib/categoryTree';

type CategoryFormState = {
  name: string;
  image_url: string;
  description: string;
  parent_id: number | null;
  sort_order: string;
};

const emptyCreateForm: CategoryFormState = {
  name: '',
  image_url: '',
  description: '',
  parent_id: null,
  sort_order: '0',
};

const emptyEditForm: CategoryFormState = {
  name: '',
  image_url: '',
  description: '',
  parent_id: null,
  sort_order: '0',
};

function collectDefaultExpanded(nodes: CategoryNode[]): Set<number> {
  const ids = new Set<number>();
  const walk = (list: CategoryNode[], depth: number) => {
    for (const node of list) {
      if (depth <= 1) ids.add(Number(node.id));
      if (Array.isArray(node.children) && node.children.length) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(nodes || [], 0);
  return ids;
}

export default function Categorias() {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createUploadError, setCreateUploadError] = useState<string | null>(null);
  const [editUploadError, setEditUploadError] = useState<string | null>(null);
  const [uploadingCreate, setUploadingCreate] = useState(false);
  const [uploadingEdit, setUploadingEdit] = useState(false);
  const [createForm, setCreateForm] = useState<CategoryFormState>(emptyCreateForm);
  const [editForm, setEditForm] = useState<CategoryFormState>(emptyEditForm);
  const [treeSearch, setTreeSearch] = useState('');

  const flat = useMemo(() => flattenCategoryTree(tree), [tree]);
  const byId = useMemo(() => new Map(flat.map((n) => [Number(n.id), n])), [flat]);
  const selectedNode = selectedId != null ? byId.get(selectedId) || null : null;
  const createEnabled = createForm.name.trim().length >= 2;
  const updateEnabled = selectedNode != null && editForm.name.trim().length >= 2;

  const moveExcludedIds = useMemo(() => {
    if (!selectedId) return new Set<number>();
    return getDescendantIds(tree, selectedId);
  }, [tree, selectedId]);

  const filteredTree = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return tree;
    const filterNodes = (nodes: CategoryNode[]): CategoryNode[] => {
      const out: CategoryNode[] = [];
      for (const node of sortCategoryNodes(nodes)) {
        const selfMatch =
          String(node.name || '').toLowerCase().includes(q) ||
          String(node.description || '').toLowerCase().includes(q);
        const children = Array.isArray(node.children) ? filterNodes(node.children) : [];
        if (selfMatch || children.length) {
          out.push({ ...node, children });
        }
      }
      return out;
    };
    return filterNodes(tree);
  }, [tree, treeSearch]);

  async function load(preferredSelectedId?: number | null) {
    setLoading(true);
    setError(null);
    try {
      const nextTree = (await Api.categoriasTree()) as CategoryNode[];
      const nextFlat = flattenCategoryTree(nextTree || []);
      const nextExpanded = collectDefaultExpanded(nextTree || []);
      setTree(nextTree || []);
      setExpandedIds((prev) => (prev.size ? prev : nextExpanded));

      const nextSelectedCandidate = preferredSelectedId ?? selectedId;
      if (
        nextSelectedCandidate != null &&
        nextFlat.some((n) => Number(n.id) === Number(nextSelectedCandidate))
      ) {
        setSelectedId(Number(nextSelectedCandidate));
      } else {
        setSelectedId(nextFlat.length ? Number(nextFlat[0].id) : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando categorias');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedNode) {
      setEditForm(emptyEditForm);
      return;
    }
    setEditForm({
      name: selectedNode.name || '',
      image_url: selectedNode.image_url || '',
      description: selectedNode.description || '',
      parent_id: selectedNode.parent_id ?? null,
      sort_order: String(selectedNode.sort_order ?? 0),
    });
  }, [selectedNode]);

  async function uploadToCloudinary(file: File, target: 'create' | 'edit') {
    if (target === 'create') {
      setCreateUploadError(null);
      setUploadingCreate(true);
    } else {
      setEditUploadError(null);
      setUploadingEdit(true);
    }
    try {
      const url = await uploadImageToCloudinary(file);
      if (target === 'create') {
        setCreateForm((prev) => ({ ...prev, image_url: url }));
      } else {
        setEditForm((prev) => ({ ...prev, image_url: url }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo subir la imagen';
      if (target === 'create') {
        setCreateUploadError(msg);
      } else {
        setEditUploadError(msg);
      }
    } finally {
      if (target === 'create') {
        setUploadingCreate(false);
      } else {
        setUploadingEdit(false);
      }
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!createEnabled) return;
    setError(null);
    try {
      const payload: any = {
        name: createForm.name.trim(),
        image_url: createForm.image_url.trim() || undefined,
        description: createForm.description.trim() || undefined,
        parent_id: createForm.parent_id ?? null,
      };
      if (createForm.sort_order.trim() !== '') {
        payload.sort_order = Number(createForm.sort_order) || 0;
      }
      const result: any = await Api.crearCategoria(payload);
      setCreateForm(emptyCreateForm);
      await load(result?.id ? Number(result.id) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la categoria');
    }
  }

  async function onUpdate(e: FormEvent) {
    e.preventDefault();
    if (!selectedNode || !updateEnabled) return;
    setError(null);
    try {
      await Api.actualizarCategoria(Number(selectedNode.id), {
        name: editForm.name.trim(),
        image_url: editForm.image_url.trim() || undefined,
        description: editForm.description.trim() || undefined,
      });
      await load(Number(selectedNode.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la categoria');
    }
  }

  async function onMove() {
    if (!selectedNode) return;
    setError(null);
    try {
      const payload: any = {
        parent_id: editForm.parent_id ?? null,
      };
      if (editForm.sort_order.trim() !== '') {
        payload.sort_order = Number(editForm.sort_order) || 0;
      }
      await Api.moverCategoria(Number(selectedNode.id), payload);
      await load(Number(selectedNode.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mover la categoria');
    }
  }

  async function onDeleteSelected() {
    if (!selectedNode) return;
    const confirmDelete = window.confirm(
      `Eliminar categoria "${selectedNode.name}" y todas sus subcategorias? Esta accion desactiva tambien sus productos.`,
    );
    if (!confirmDelete) return;
    setError(null);
    try {
      await Api.eliminarCategoria(Number(selectedNode.id));
      await load(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la categoria');
    }
  }

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderTree(nodes: CategoryNode[], level = 0): JSX.Element[] {
    return sortCategoryNodes(nodes).map((node) => {
      const id = Number(node.id);
      const children = Array.isArray(node.children) ? node.children : [];
      const hasChildren = children.length > 0;
      const expanded = expandedIds.has(id);
      const selected = selectedId === id;
      return (
        <div key={id} className="space-y-1">
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
              selected
                ? 'border-cyan-400/40 bg-cyan-500/10'
                : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
            }`}
            style={{ marginLeft: `${level * 12}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                className="h-6 w-6 rounded border border-white/10 text-xs text-slate-300 hover:bg-white/10"
                onClick={() => toggleExpanded(id)}
                aria-label={expanded ? 'Contraer' : 'Expandir'}
              >
                {expanded ? '-' : '+'}
              </button>
            ) : (
              <div className="h-6 w-6" />
            )}
            <button
              type="button"
              className="flex-1 min-w-0 text-left"
              onClick={() => setSelectedId(id)}
            >
              <div className="text-sm text-slate-100 truncate">{node.name}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {node.description ? node.description : `Nivel ${node.depth ?? level}`}
              </div>
            </button>
            <span className="text-[10px] rounded border border-white/10 px-1.5 py-0.5 text-slate-400">
              #{id}
            </span>
          </div>
          {hasChildren && expanded && <div className="space-y-1">{renderTree(children, level + 1)}</div>}
        </div>
      );
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="app-title">Categorias</h2>

      {error && <Alert kind="error" message={error} />}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="app-card p-4 xl:col-span-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-200">Arbol de categorias</div>
              <div className="text-xs text-slate-500">Gestiona ramas y subramas sin limite</div>
            </div>
            <div className="text-[11px] text-slate-400">{flat.length} categorias</div>
          </div>

          <input
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            className="input-modern text-xs h-9 w-full"
            placeholder="Buscar categoria por nombre o descripcion..."
          />

          <div className="max-h-[68vh] overflow-auto app-scrollbar pr-1">
            {loading ? (
              <div className="py-8 text-center text-slate-500">Cargando...</div>
            ) : filteredTree.length === 0 ? (
              <div className="py-8 text-center text-slate-500">Sin categorias para mostrar.</div>
            ) : (
              <div className="space-y-1">{renderTree(filteredTree)}</div>
            )}
          </div>
        </div>

        <div className="app-card p-4 xl:col-span-7 space-y-4">
          <form onSubmit={onCreate} className="app-panel p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
            <div className="md:col-span-6">
              <div className="text-sm font-semibold text-slate-200">Nueva categoria</div>
              <div className="text-xs text-slate-500">Puedes crear en raiz o dentro de cualquier rama.</div>
            </div>

            {createUploadError && (
              <div className="md:col-span-6">
                <Alert kind="error" message={createUploadError} />
              </div>
            )}

            <input
              className="input-modern text-sm md:col-span-2"
              placeholder="Nombre"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <div className="md:col-span-4">
              <CategoryTreePicker
                tree={tree}
                value={createForm.parent_id}
                onChange={(id) => setCreateForm((prev) => ({ ...prev, parent_id: id }))}
                allowClear
                placeholder="Padre opcional (si vacio, crea en raiz)"
              />
            </div>
            <input
              className="input-modern text-sm md:col-span-4"
              placeholder="Descripcion (opcional)"
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <input
              className="input-modern text-sm md:col-span-2"
              placeholder="Orden"
              type="number"
              value={createForm.sort_order}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, sort_order: e.target.value }))}
            />
            <div className="md:col-span-3 flex flex-col gap-1">
              <input
                type="file"
                accept="image/*"
                className="input-modern text-sm"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  uploadToCloudinary(file, 'create');
                }}
              />
              {uploadingCreate && <span className="text-[11px] text-slate-400">Subiendo imagen...</span>}
            </div>
            <input
              className="input-modern text-xs md:col-span-3"
              placeholder="URL imagen (opcional)"
              value={createForm.image_url}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, image_url: e.target.value }))}
            />

            <Button disabled={!createEnabled} className="md:col-span-6">
              Crear categoria
            </Button>
          </form>

          <form onSubmit={onUpdate} className="app-panel p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
            <div className="md:col-span-6">
              <div className="text-sm font-semibold text-slate-200">Categoria seleccionada</div>
              <div className="text-xs text-slate-500">
                {selectedNode ? `Editando: ${selectedNode.pathLabel}` : 'Selecciona una categoria del arbol'}
              </div>
            </div>

            {editUploadError && (
              <div className="md:col-span-6">
                <Alert kind="error" message={editUploadError} />
              </div>
            )}

            <input
              className="input-modern text-sm md:col-span-2"
              placeholder="Nombre"
              value={editForm.name}
              disabled={!selectedNode}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              className="input-modern text-sm md:col-span-4"
              placeholder="Descripcion"
              value={editForm.description}
              disabled={!selectedNode}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
            />

            <div className="md:col-span-3 flex flex-col gap-1">
              <input
                type="file"
                accept="image/*"
                className="input-modern text-sm"
                disabled={!selectedNode}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  uploadToCloudinary(file, 'edit');
                }}
              />
              {uploadingEdit && <span className="text-[11px] text-slate-400">Subiendo imagen...</span>}
            </div>
            <input
              className="input-modern text-xs md:col-span-3"
              placeholder="URL imagen (opcional)"
              value={editForm.image_url}
              disabled={!selectedNode}
              onChange={(e) => setEditForm((prev) => ({ ...prev, image_url: e.target.value }))}
            />

            <div className="md:col-span-4">
              <CategoryTreePicker
                tree={tree}
                value={editForm.parent_id}
                onChange={(id) => setEditForm((prev) => ({ ...prev, parent_id: id }))}
                allowClear
                excludeIds={moveExcludedIds}
                placeholder="Mover a otra rama (opcional)"
                disabled={!selectedNode}
              />
            </div>
            <input
              className="input-modern text-sm md:col-span-2"
              placeholder="Orden"
              type="number"
              value={editForm.sort_order}
              disabled={!selectedNode}
              onChange={(e) => setEditForm((prev) => ({ ...prev, sort_order: e.target.value }))}
            />

            <div className="md:col-span-6 flex flex-wrap gap-2">
              <Button disabled={!updateEnabled}>Guardar cambios</Button>
              <Button type="button" variant="outline" disabled={!selectedNode} onClick={onMove}>
                Mover rama
              </Button>
              <Button type="button" variant="ghost" disabled={!selectedNode} onClick={onDeleteSelected}>
                Eliminar rama
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

