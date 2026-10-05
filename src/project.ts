/**
 * Project data for the X-Ray panel, read on the server from the Content Management API
 * with a read-only token: which environments exist and which records the page shows.
 * Plain fetch, no dependencies. The token never reaches the browser.
 */
export type RecordStatus = "published" | "updated" | "draft" | "unknown";

export type RecordInfo = {
  id: string;
  model: string | null;
  modelApiKey: string | null;
  /** The value of the model's title field (or a field named like one), shortened. */
  title: string | null;
  /** A block lives inside a record and has no edit page of its own. */
  block: boolean;
  status: RecordStatus;
  updatedAt: string | null;
  editUrl: string | null;
  /**
   * Where Content Link points for this content: the record itself, or for a block the record that holds it
   * and the field path down to the block (e.g. `content.3`). Used to find it on the page.
   */
  anchor: { recordId: string; fieldPath: string } | null;
};

export type ProjectInfo = {
  environments: { name: string; primary: boolean }[];
  records: RecordInfo[];
  /** Records found on the page but left out because of the cap. */
  moreRecords: number;
  /** How many of `records` are blocks. */
  blocks: number;
  /**
   * Every block inside the page's records, nested ones and all locales included, counted by model
   * (most first). Read from the records in full, so it also counts blocks the page does not render.
   */
  blockCounts: { model: string; modelApiKey: string | null; count: number }[];
  error: string | null;
};

export type FetchProjectInfoOptions = {
  /** A Content Management API token. Give it a read-only role. */
  token: string;
  /** The environment the page read (the x-environment of its queries); omitted means the primary one. */
  environment?: string | null;
  /** IDs of the records the page shows. Unknown or block IDs are simply not returned. */
  recordIds: string[];
  /** DatoCMS admin URL, for the edit links. */
  projectUrl?: string | null;
  /** At most this many IDs are looked up, blocks included (default 100). */
  maxRecords?: number;
  fetch?: typeof fetch;
};

const CMA = "https://site-api.datocms.com";
const TTL_MS = 60_000;
/** Title fields belong to the schema, which changes rarely. */
const FIELDS_TTL_MS = 10 * 60_000;
/** The most records the CMA returns per request when blocks come nested. */
const NESTED_PAGE = 30;

type JsonApi = { data?: unknown; errors?: { attributes?: { code?: string } }[] };
type Cached<T> = { at: number; value: T };

// Models and environments change rarely: kept for a minute per token and environment.
const modelCache = new Map<string, Cached<Map<string, Model>>>();
const environmentCache = new Map<string, Cached<{ name: string; primary: boolean }[]>>();

async function cma(path: string, options: FetchProjectInfoOptions): Promise<unknown[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
    Accept: "application/json",
    "X-Api-Version": "3",
  };
  if (options.environment) headers["X-Environment"] = options.environment;
  const response = await (options.fetch ?? fetch)(`${CMA}${path}`, { headers });
  const body = (await response.json().catch(() => ({}))) as JsonApi;
  if (!response.ok) {
    // DatoCMS sends errors as `data: [{ type: "api_error", attributes: { code } }]`
    const first = (Array.isArray(body.data) ? body.data[0] : undefined) as { attributes?: { code?: string } } | undefined;
    const code = body.errors?.[0]?.attributes?.code ?? first?.attributes?.code;
    throw new Error(`CMA ${path.split("?")[0]} answered ${response.status}${code ? ` (${code})` : ""}`);
  }
  return Array.isArray(body.data) ? body.data : [];
}

async function cached<T>(cache: Map<string, Cached<T>>, key: string, load: () => Promise<T>, ttl = TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Runs `task` on every item, at most `size` at a time. */
async function inBatches<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += size) await Promise.all(items.slice(start, start + size).map(task));
}

type Resource = {
  id?: string;
  attributes?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string } | null }>;
};
type Model = { name: string; apiKey: string; block: boolean; titleFieldId: string | null };

const fieldCache = new Map<string, Cached<Map<string, string>>>();
const TITLE_LIKE = ["title", "name", "label", "heading", "question", "internal_name"];
const TITLE_MAX = 60;

/** A field value as one line of text: a localized value gives its first non-empty locale. */
function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const line = value.replace(/\s+/g, " ").trim();
    if (!line) return null;
    return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const localized of Object.values(value)) {
      const text = asText(localized);
      if (text) return text;
    }
  }
  return null;
}

function titleOf(attributes: Record<string, unknown> | undefined, titleKey: string | null): string | null {
  if (!attributes) return null;
  if (titleKey) return asText(attributes[titleKey]);
  for (const key of TITLE_LIKE) {
    const text = asText(attributes[key]);
    if (text) return text;
  }
  return null;
}

const statusOf = (value: unknown): RecordStatus =>
  value === "published" || value === "updated" || value === "draft" ? value : "unknown";

/** Never throws: a failure comes back in `error`, with whatever could be read. */
export async function fetchProjectInfo(options: FetchProjectInfoOptions): Promise<ProjectInfo> {
  const max = options.maxRecords ?? 100;
  const ids = [...new Set(options.recordIds)].slice(0, max);
  const info: ProjectInfo = { environments: [], records: [], moreRecords: Math.max(0, new Set(options.recordIds).size - max), blocks: 0, blockCounts: [], error: null };
  const key = `${options.token.slice(-6)}:${options.environment ?? ""}`;
  try {
    info.environments = await cached(environmentCache, options.token.slice(-6), async () =>
      ((await cma("/environments", { ...options, environment: null })) as Resource[]).map((env) => ({
        name: String(env.id),
        primary: env.meta?.primary === true,
      })),
    );
    if (ids.length === 0) return info;
    const models = await cached(modelCache, key, async () => {
      const map = new Map<string, Model>();
      for (const model of (await cma("/item-types", options)) as Resource[]) {
        map.set(String(model.id), {
          name: String(model.attributes?.name ?? ""),
          apiKey: String(model.attributes?.api_key ?? ""),
          block: model.attributes?.modular_block === true,
          titleFieldId: model.relationships?.presentation_title_field?.data?.id ?? model.relationships?.title_field?.data?.id ?? null,
        });
      }
      return map;
    });
    // With nested blocks the CMA returns at most 30 records per request: ask in batches, in parallel.
    const batches: string[][] = [];
    for (let start = 0; start < ids.length; start += NESTED_PAGE) batches.push(ids.slice(start, start + NESTED_PAGE));
    const items = (
      await Promise.all(
        batches.map(
          (batch) =>
            cma(`/items?filter[ids]=${batch.map(encodeURIComponent).join(",")}&version=current&nested=true&page[limit]=${NESTED_PAGE}`, options) as Promise<Resource[]>,
        ),
      )
    ).flat();
    // API keys of the title fields, only for the models on this page.
    const typeIds = new Set(items.map((item) => item.relationships?.item_type?.data?.id).filter((id): id is string => !!id));
    const titleKeys = new Map<string, string>();
    // One call per model, four at a time to stay under the CMA rate limit. A title field that
    // cannot be read leaves its records without a title, instead of failing the whole panel.
    await inBatches([...typeIds], 4, async (typeId) => {
      const fieldId = models.get(typeId)?.titleFieldId;
      if (!fieldId) return;
      try {
        const fields = await cached(
          fieldCache,
          `${key}:${typeId}`,
          async () => {
            const map = new Map<string, string>();
            for (const field of (await cma(`/item-types/${encodeURIComponent(typeId)}/fields`, options)) as Resource[]) {
              map.set(String(field.id), String(field.attributes?.api_key ?? ""));
            }
            return map;
          },
          FIELDS_TTL_MS,
        );
        const apiKey = fields.get(fieldId);
        if (apiKey) titleKeys.set(typeId, apiKey);
      } catch {
        // no title for this model
      }
    });
    const primary = info.environments.find((env) => env.primary)?.name;
    const base = options.projectUrl?.trim().replace(/\/+$/, "");
    const envPath = options.environment && options.environment !== primary ? `/environments/${encodeURIComponent(options.environment)}` : "";
    const byId = new Map(items.map((item) => [String(item.id), item]));
    const typeOf = (node: unknown) => (node as Resource | null)?.relationships?.item_type?.data?.id;
    const isBlockModel = (typeId: string | undefined) => (typeId ? models.get(typeId)?.block === true : false);
    // With nested=true the blocks come inside their records, in every locale and at any depth.
    const nestedBlocks = new Set<string>();
    const holders = new Map<string, { parentId: string; segment: string }>();
    const counts = new Map<string, number>();
    const isBlock = (id: string) => nestedBlocks.has(id) || isBlockModel(typeOf(byId.get(id)));
    // A single-block field gives `field`, a list `field.index`, a localized value `field.locale…`.
    const visit = (parentId: string, segment: string, value: unknown, count: boolean, depth: number): void => {
      if (depth > 20 || value === null || typeof value !== "object") {
        if (typeof value === "string" && isBlockModel(typeOf(byId.get(value)))) holders.set(value, { parentId, segment });
        return;
      }
      const node = value as Resource & { type?: string };
      if (node.type === "item" && isBlockModel(typeOf(node))) {
        const id = String(node.id);
        nestedBlocks.add(id);
        if (!holders.has(id)) holders.set(id, { parentId, segment });
        if (count) counts.set(typeOf(node)!, (counts.get(typeOf(node)!) ?? 0) + 1);
        for (const [field, child] of Object.entries(node.attributes ?? {})) visit(id, field, child, count, depth + 1);
        return;
      }
      const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child] as const) : Object.entries(value);
      for (const [key, child] of entries) visit(parentId, `${segment}.${key}`, child, count, depth + 1);
    };
    for (const item of items) {
      // Only records count their blocks: a block fetched on its own is already inside its record.
      const count = !isBlockModel(typeOf(item));
      for (const [field, value] of Object.entries(item.attributes ?? {})) visit(String(item.id), field, value, count, 0);
    }
    info.blockCounts = [...counts]
      .map(([typeId, total]) => ({ model: models.get(typeId)?.name || typeId, modelApiKey: models.get(typeId)?.apiKey || null, count: total }))
      .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
    const anchorOf = (id: string): RecordInfo["anchor"] => {
      const path: string[] = [];
      let current = id;
      for (let depth = 0; depth < 10 && isBlock(current); depth++) {
        const holder = holders.get(current);
        if (!holder) return null;
        path.unshift(holder.segment);
        current = holder.parentId;
      }
      return isBlock(current) ? null : { recordId: current, fieldPath: path.join(".") };
    };
    // Same order as the page handed them over.
    for (const id of ids) {
      const item = byId.get(id);
      if (!item) continue;
      const typeId = item.relationships?.item_type?.data?.id ?? null;
      const model = typeId ? models.get(typeId) : undefined;
      const block = model?.block === true;
      if (block) info.blocks++;
      info.records.push({
        id,
        model: model?.name || null,
        modelApiKey: model?.apiKey || null,
        title: titleOf(item.attributes, typeId ? (titleKeys.get(typeId) ?? null) : null),
        block,
        status: statusOf(item.meta?.status),
        updatedAt: typeof item.meta?.updated_at === "string" ? item.meta.updated_at : null,
        anchor: anchorOf(id),
        editUrl: !block && base && typeId ? `${base}${envPath}/editor/item_types/${typeId}/items/${id}/edit` : null,
      });
    }
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
  }
  return info;
}

const EDIT_LINK = /\/item_types\/([^/?#]+)\/items\/([^/?#]+)/;

/**
 * IDs of the records in a query result: every object with a string `id`, plus the records behind
 * Content Link metadata when a `decode` function for it is given (e.g. `decodeStega` of
 * `@datocms/content-link`), which also finds records whose `id` the query did not select.
 */
export function collectRecordIds(value: unknown, decode?: (text: string) => { href: string } | null): string[] {
  const ids = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 40 || node === null) return;
    if (typeof node === "string") {
      const href = decode?.(node)?.href;
      const match = href ? EDIT_LINK.exec(href) : null;
      if (match) ids.add(decodeURIComponent(match[2]));
      return;
    }
    if (Array.isArray(node)) return node.forEach((child) => walk(child, depth + 1));
    if (typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (typeof record.id === "string" && record.id !== "") ids.add(record.id);
      for (const child of Object.values(record)) walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return [...ids];
}
