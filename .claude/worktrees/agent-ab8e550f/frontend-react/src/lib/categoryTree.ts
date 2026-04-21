export type CategoryNode = {
  id: number;
  name: string;
  image_url?: string | null;
  description?: string | null;
  parent_id?: number | null;
  depth?: number;
  path?: string | null;
  sort_order?: number;
  children?: CategoryNode[];
};

export type FlatCategoryNode = CategoryNode & {
  level: number;
  pathLabel: string;
  parentName: string | null;
};

function toNumberId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function sortCategoryNodes(nodes: CategoryNode[]): CategoryNode[] {
  return [...nodes].sort((a, b) => {
    const sa = Number.isInteger(Number(a.sort_order)) ? Number(a.sort_order) : 0;
    const sb = Number.isInteger(Number(b.sort_order)) ? Number(b.sort_order) : 0;
    if (sa !== sb) return sa - sb;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
  });
}

export function flattenCategoryTree(tree: CategoryNode[]): FlatCategoryNode[] {
  const out: FlatCategoryNode[] = [];
  const walk = (nodes: CategoryNode[], level: number, parentNames: string[]) => {
    for (const node of sortCategoryNodes(nodes)) {
      const name = String(node.name || '').trim();
      if (!name) continue;
      const pathNames = [...parentNames, name];
      out.push({
        ...node,
        level,
        pathLabel: pathNames.join(' > '),
        parentName: parentNames.length ? parentNames[parentNames.length - 1] : null,
      });
      if (Array.isArray(node.children) && node.children.length) {
        walk(node.children, level + 1, pathNames);
      }
    }
  };
  walk(Array.isArray(tree) ? tree : [], 0, []);
  return out;
}

export function getDescendantIds(tree: CategoryNode[], rootId: number): Set<number> {
  const ids = new Set<number>();
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      if (Number(node.id) === Number(rootId)) {
        collect(node);
        return true;
      }
      if (Array.isArray(node.children) && node.children.length) {
        const found = walk(node.children);
        if (found) return true;
      }
    }
    return false;
  };
  const collect = (node: CategoryNode) => {
    const id = toNumberId(node.id);
    if (id) ids.add(id);
    for (const child of node.children || []) collect(child);
  };
  walk(tree || []);
  return ids;
}

export function parseDbCategoryPath(path: string | null | undefined): number[] {
  if (!path) return [];
  const chunks = String(path)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  const ids: number[] = [];
  for (const chunk of chunks) {
    const id = toNumberId(chunk);
    if (id) ids.push(id);
  }
  return ids;
}

export function buildPathLabelFromDbPath(
  path: string | null | undefined,
  byId: Map<number, FlatCategoryNode>,
): string | null {
  const ids = parseDbCategoryPath(path);
  if (!ids.length) return null;
  const names: string[] = [];
  for (const id of ids) {
    const node = byId.get(id);
    if (node?.name) names.push(node.name);
  }
  return names.length ? names.join(' > ') : null;
}

