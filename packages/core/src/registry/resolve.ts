import type { RegistryItem } from "./types";
import { fetchRegistryItem } from "./registry";

export type ResolvedRegistryItem = {
  item: RegistryItem;
  source: string;
};

export async function resolveRegistryTree(
  specs: string[],
  opts: { cwd: string },
): Promise<ResolvedRegistryItem[]> {
  const resolvedByKey = new Map<string, ResolvedRegistryItem>();
  const visiting = new Set<string>();
  const ordered: ResolvedRegistryItem[] = [];

  async function visit(spec: string): Promise<void> {
    const fetched = await fetchRegistryItem(spec, opts);
    const key = `${fetched.item.kind}/${fetched.item.name}`;

    if (resolvedByKey.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Registry dependency cycle detected at ${key}`);
    }

    visiting.add(key);

    for (const dep of fetched.item.registryDependencies ?? []) {
      await visit(dep);
    }

    visiting.delete(key);
    resolvedByKey.set(key, fetched);
    ordered.push(fetched);
  }

  for (const spec of specs) {
    await visit(spec);
  }

  return ordered;
}
