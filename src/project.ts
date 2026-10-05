/**
 * Project data for the Advanced panel, read on the server from the Content Management API
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
    const code = body.errors?.[0]?.attributes?.code;
    throw new Error(`CMA ${path.split("?")[0]} answered ${response.status}${code ? ` (${code})` : ""}`);
  }
  return Array.isArray(body.data) ? body.data : [];
}

async function cached<T>(cache: Map<string, Cached<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
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
  const info: ProjectInfo = { environments: [], records: [], moreRecords: Math.max(0, new Set(options.recordIds).size - max), blocks: 0, error: null };
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
    const items = (await cma(`/items?filter[ids]=${ids.map(encodeURIComponent).join(",")}&version=current&page[limit]=${max}`, options)) as Resource[];
    // API keys of the title fields, only for the models on this page.
    const typeIds = new Set(items.map((item) => item.relationships?.item_type?.data?.id).filter((id): id is string => !!id));
    const titleKeys = new Map<string, string>();
    await Promise.all(
      [...typeIds].map(async (typeId) => {
        const fieldId = models.get(typeId)?.titleFieldId;
        if (!fieldId) return;
        const fields = await cached(fieldCache, `${key}:${typeId}`, async () => {
          const map = new Map<string, string>();
          for (const field of (await cma(`/item-types/${encodeURIComponent(typeId)}/fields`, options)) as Resource[]) {
            map.set(String(field.id), String(field.attributes?.api_key ?? ""));
          }
          return map;
        });
        const apiKey = fields.get(fieldId);
        if (apiKey) titleKeys.set(typeId, apiKey);
      }),
    );
    const primary = info.environments.find((env) => env.primary)?.name;
    const base = options.projectUrl?.trim().replace(/\/+$/, "");
    const envPath = options.environment && options.environment !== primary ? `/environments/${encodeURIComponent(options.environment)}` : "";
    const byId = new Map(items.map((item) => [String(item.id), item]));
    const isBlock = (id: string) => {
      const typeId = byId.get(id)?.relationships?.item_type?.data?.id;
      return typeId ? models.get(typeId)?.block === true : false;
    };
    // Each block's holder and its place in it: a single-block field gives `field`, a list `field.index`.
    const holders = new Map<string, { parentId: string; segment: string }>();
    for (const item of items) {
      for (const [field, value] of Object.entries(item.attributes ?? {})) {
        if (typeof value === "string" && isBlock(value)) holders.set(value, { parentId: String(item.id), segment: field });
        if (Array.isArray(value)) {
          value.forEach((child, index) => {
            if (typeof child === "string" && isBlock(child)) holders.set(child, { parentId: String(item.id), segment: `${field}.${index}` });
          });
        }
      }
    }
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
