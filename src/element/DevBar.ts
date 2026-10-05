import {
  DEFAULT_STATE,
  MODE_COOKIE,
  VISUAL_COOKIE,
  parseCookies,
  resolveState,
  serializeVisual,
  type DevPreviewState,
  type Mode,
} from "../contract";
import { cookiesWork, writeCookie } from "./cookies";
import type { ProjectInfo, RecordInfo } from "../project";
import { assessReport, describeWeight, parseDevBarData, summarizeReports, type QueryReport } from "../queries";
import { isAllowedHost } from "./hosts";
import { environmentInfo, projectHref } from "./links";
import { takeUrlParams } from "./params";
import { isEditableTarget, shortcutFor } from "./shortcuts";
import { STYLES } from "./styles";
import { TEMPLATE } from "./template";

export const CHANGE_EVENT = "datocms-dev-bar:change";
/** `visualEditing` is the effective value: false in published mode. */
export type ChangeDetail = { mode: Mode; visualEditing: boolean };

// What the figures on a query line mean, in the order they appear.
const WEIGHT_HELP = [
  ["ms", "time DatoCMS spent on the query. On a cache hit it repeats the time of the original run."],
  ["KB", "size of the JSON response, uncompressed."],
  ["cx", "complexity, as a share of the maximum DatoCMS accepts. Deep nesting and long lists raise it."],
  ["len", "length of the query text, as a share of the limit for being cached on the CDN."],
  ["hit, miss, bypass", "hit: answered from the CDN cache. miss: computed now and stored. bypass: caching skipped, as with drafts."],
];

const OPEN_KEY = "datocms-dev-bar:open";
const ADVANCED_KEY = "datocms-dev-bar:advanced";
const TAB_KEY = "datocms-dev-bar:tab";
const TAB_KEYS = ["general", "records", "queries", "help"];

// On the server there is no HTMLElement: importing this module must still work.
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as unknown as typeof HTMLElement;

let activeInstance: DevBar | null = null;
let refusalLogged = false;

export class DevBar extends Base {
  static observedAttributes = ["project-url", "environment", "environment-primary", "position"];

  private state: DevPreviewState = { ...DEFAULT_STATE };
  private open = false;
  private advanced = false;
  private reports: QueryReport[] = [];
  private project: ProjectInfo | null = null;
  private tipCount = 0;
  private recordFilter = "";
  private tab = "general";
  /** Queries opened in the Queries tab, by position: kept while the panel redraws. */
  private openQueries = new Set<number>();
  private cookiesOk = true;
  private root: ShadowRoot | null = null;
  private readonly onKeydown = (event: KeyboardEvent) => this.handleKeydown(event);

  connectedCallback() {
    // One bar per page: a second element stays empty.
    if (activeInstance && activeInstance !== this) return;
    const extraHosts = (this.getAttribute("allow-hosts") ?? "").split(/\s+/);
    if (!isAllowedHost(location.hostname, extraHosts)) {
      if (!refusalLogged) {
        console.info(
          `[datocms-dev-bar] hidden: "${location.hostname}" is not a local host. Add it with allow-hosts if this is a development machine.`,
        );
        refusalLogged = true;
      }
      return;
    }
    activeInstance = this;
    this.cookiesOk = cookiesWork(document);
    if (this.cookiesOk) this.applyUrlParams();
    this.state = this.readState();
    this.open = readFlag(OPEN_KEY);
    this.advanced = readFlag(ADVANCED_KEY);
    this.tab = readTab();
    ({ queries: this.reports, project: this.project } = readData());
    this.render();
    if (this.getAttribute("shortcuts") !== "off") window.addEventListener("keydown", this.onKeydown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onKeydown);
    if (activeInstance === this) activeInstance = null;
  }

  attributeChangedCallback() {
    if (this.root) this.update();
  }

  /** ?datocms= and ?datocms-visual= become cookies and leave the address bar. The server already used them. */
  private applyUrlParams() {
    const { overrides, cleanedHref } = takeUrlParams(location.href);
    if (cleanedHref === null) return;
    if (overrides.mode) writeCookie(document, MODE_COOKIE, overrides.mode);
    if (overrides.visualEditing !== undefined) writeCookie(document, VISUAL_COOKIE, serializeVisual(overrides.visualEditing));
    history.replaceState(history.state, "", cleanedHref);
  }

  private readState(): DevPreviewState {
    const cookies = parseCookies(document.cookie);
    return resolveState([{ mode: cookies.get(MODE_COOKIE), visual: cookies.get(VISUAL_COOKIE) }]);
  }

  private render() {
    this.root ??= this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style>${TEMPLATE}`;
    this.root.querySelector(".tab")!.addEventListener("click", () => this.setOpen(!this.open));
    this.root.querySelector<HTMLInputElement>(".records-filter")!.addEventListener("input", (event) => {
      this.recordFilter = (event.target as HTMLInputElement).value;
      this.applyRecordFilter();
    });
    this.root.querySelector(".advanced")!.addEventListener("click", () => this.setAdvanced(!this.advanced));
    this.root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => this.setTab(button.dataset.tab!));
      // Arrow keys move between tabs, as in any tab list.
      button.addEventListener("keydown", (event) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = TAB_KEYS[(TAB_KEYS.indexOf(this.tab) + step + TAB_KEYS.length) % TAB_KEYS.length];
        this.setTab(next);
        this.root!.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)!.focus();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) =>
      button.addEventListener("click", () => this.commit({ ...this.state, mode: button.dataset.mode as Mode })),
    );
    this.root.querySelectorAll<HTMLButtonElement>("[data-visual]").forEach((button) =>
      button.addEventListener("click", () => this.commit({ ...this.state, visualEditing: button.dataset.visual === "on" })),
    );
    this.update();
  }

  private update() {
    const root = this.root!;
    const wrap = root.querySelector<HTMLElement>(".wrap")!;
    wrap.dataset.position = this.getAttribute("position") === "bottom-right" ? "right" : "left";
    wrap.dataset.mode = this.state.mode;
    wrap.toggleAttribute("data-open", this.open);
    wrap.toggleAttribute("data-advanced", this.advanced);
    root.querySelector(".advanced")!.setAttribute("aria-expanded", String(this.advanced));
    this.updatePanel();
    root.querySelector(".tab")!.setAttribute("aria-expanded", String(this.open));

    const published = this.state.mode === "published";
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === this.state.mode));
      button.disabled = !this.cookiesOk;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-visual]").forEach((button) => {
      button.setAttribute("aria-pressed", String((button.dataset.visual === "on") === this.state.visualEditing));
      button.disabled = !this.cookiesOk || published;
    });

    const href = projectHref(this.getAttribute("project-url"), this.getAttribute("environment"));
    const link = root.querySelector<HTMLAnchorElement>(".project")!;
    link.hidden = href === null;
    if (href !== null) link.href = href;
    root.querySelector<HTMLElement>(".warning")!.hidden = this.cookiesOk;
  }

  private setOpen(open: boolean) {
    this.open = open;
    writeFlag(OPEN_KEY, open);
    this.update();
  }

  private setTab(tab: string) {
    if (!TAB_KEYS.includes(tab)) return;
    this.tab = tab;
    try {
      sessionStorage.setItem(TAB_KEY, tab);
    } catch {
      // The tab is remembered only while sessionStorage works.
    }
    this.update();
  }

  private setAdvanced(advanced: boolean) {
    this.advanced = advanced;
    writeFlag(ADVANCED_KEY, advanced);
    this.update();
  }

  /** Fills the Advanced panel from the reports the site wrote into the page. Values go in as text, never as HTML. */
  private updatePanel() {
    const root = this.root!;
    const summary = summarizeReports(this.reports);
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      const selected = button.dataset.tab === this.tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll<HTMLElement>("[data-pane]").forEach((pane) => (pane.hidden = pane.dataset.pane !== this.tab));
    const counts: Record<string, number | null> = {
      records: this.project && !this.project.error ? this.project.records.length : null,
      queries: this.reports.length,
    };
    root.querySelectorAll<HTMLElement>("[data-count]").forEach((badge) => {
      const value = counts[badge.dataset.count!];
      badge.textContent = value ? String(value) : "";
      badge.hidden = !value;
    });
    root.querySelectorAll<HTMLElement>(".empty").forEach((note) => (note.hidden = this.reports.length > 0));
    root.querySelectorAll<HTMLElement>("[data-queries]").forEach((row) => (row.hidden = this.reports.length === 0));
    root.querySelectorAll<HTMLElement>("[data-row]").forEach((cell) => {
      cell.textContent = summary[cell.dataset.row as keyof typeof summary] ?? "";
    });
    // The environment that answered wins; without queries, the attribute, else the primary one.
    const env = environmentInfo(this.getAttribute("environment"), this.hasAttribute("environment-primary"));
    const answered = this.reports.length ? summary.environment : null;
    root.querySelector<HTMLElement>('[data-row="environment"]')!.textContent =
      answered && answered !== "n/a" ? answered : (env.name ?? "Primary environment");
    // With project data the badge is a fact; without, a guess from the attributes.
    const shown = root.querySelector<HTMLElement>('[data-row="environment"]')!.textContent;
    const known = this.project?.environments.find((e) => e.name === shown);
    const primary = known ? known.primary : env.primary;
    const badge = root.querySelector<HTMLElement>(".badge")!;
    badge.dataset.primary = String(primary);
    badge.textContent = primary ? "primary" : "not primary";
    this.updateRecords();
    const lines = root.querySelector<HTMLElement>(".query-lines")!;
    lines.hidden = this.reports.length === 0;
    lines.replaceChildren(...this.reports.map((report, index) => this.queryLineItem(report, index)));
    const list = root.querySelector<HTMLElement>(".queries")!;
    list.hidden = this.reports.length === 0;
    list.replaceChildren(...this.reports.map((report, index) => this.queryItem(report, index)));
  }

  /** One query: a line with its weight and flags, and under it the text and variables to read and copy. */
  /** The line of a query: name, flags, the figures, and the "i" that explains them. */
  private queryLine(report: QueryReport, className: string): HTMLElement {
    const line = el("div", className);
    line.append(el("span", "q-name", report.operation ?? "(unnamed query)"));
    for (const flag of assessReport(report)) {
      const chip = el("span", "flag", flag.label);
      chip.dataset.kind = flag.kind;
      chip.title = flag.why;
      line.append(chip);
    }
    const weight = describeWeight(report);
    line.append(el("span", "q-weight", `${weight.time} · ${weight.size} · cx ${weight.complexity} · len ${weight.length} · ${report.cache}`));
    line.append(this.weightInfo(++this.tipCount));
    return line;
  }

  /** In General: the line alone. A click opens the query in the Queries tab. */
  private queryLineItem(report: QueryReport, index: number): HTMLElement {
    const line = this.queryLine(report, "q-line q-jump");
    line.tabIndex = 0;
    line.setAttribute("role", "button");
    line.title = "Show the query";
    const open = (event: Event) => {
      if ((event.target as HTMLElement).closest(".info")) return;
      this.openQueries.add(index);
      this.setTab("queries");
      const target = this.root!.querySelectorAll<HTMLElement>(".queries > li")[index];
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    line.addEventListener("click", open);
    line.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(event);
      }
    });
    const item = el("li");
    item.append(line);
    return item;
  }

  /**
   * In Queries: the line, why it is flagged, and the text and variables to read and copy.
   * A single query is open; with more, each opens on click.
   */
  private queryItem(report: QueryReport, index: number): HTMLElement {
    const item = el("li");
    const details = document.createElement("details");
    details.open = this.reports.length === 1 || this.openQueries.has(index);
    details.addEventListener("toggle", () => {
      if (details.open) this.openQueries.add(index);
      else this.openQueries.delete(index);
    });
    const summary = document.createElement("summary");
    summary.append(...this.queryLine(report, "q-line").childNodes);
    summary.className = "q-line";
    const body = el("div", "q-body");
    for (const flag of assessReport(report)) body.append(el("p", "q-why", flag.why));
    if (report.query) body.append(this.codeBlock("Query", report.query));
    if (report.variables) body.append(this.codeBlock("Variables", report.variables));
    if (!report.query) body.append(el("p", "q-why", "The site did not hand over the query text."));
    details.append(summary, body);
    item.append(details);
    return item;
  }

  private updateRecords() {
    const root = this.root!;
    const note = root.querySelector<HTMLElement>(".records-note")!;
    const list = root.querySelector<HTMLElement>(".records")!;
    const project = this.project;
    let message = "";
    if (!project) message = "Add a read-only Content Management API token on the server to see them: see the README.";
    else if (project.error) message = `Could not read the project: ${project.error}`;
    else if (project.records.length === 0) message = "No records found in this page's queries.";
    note.textContent = message;
    note.hidden = message === "";
    const records = project?.records ?? [];
    const filter = root.querySelector<HTMLInputElement>(".records-filter")!;
    filter.hidden = records.length === 0;
    filter.value = this.recordFilter;
    list.replaceChildren(...groupByModel(records).map((group) => groupItem(group)));
    // Every block inside these records, by model, all locales
    const counts = project && !project.error ? project.blockCounts : [];
    const box = root.querySelector<HTMLElement>(".block-counts")!;
    box.hidden = counts.length === 0;
    const total = counts.reduce((sum, b) => sum + b.count, 0);
    root.querySelector<HTMLElement>(".block-total")!.textContent = `${total} ${total === 1 ? "block" : "blocks"} in these records, all locales`;
    root.querySelector<HTMLElement>(".block-list")!.replaceChildren(
      ...counts.map((b) => {
        const item = el("li");
        item.append(el("span", "r-model", b.model), el("span", "r-count", `×${b.count}`));
        return item;
      }),
    );
    this.applyRecordFilter();
  }

  /** Shows the records and blocks whose model, API key or status contain every word typed. */
  private applyRecordFilter() {
    const root = this.root!;
    const project = this.project;
    if (!project || project.error || project.records.length === 0) return;
    const words = this.recordFilter.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    root.querySelectorAll<HTMLElement>(".r-group").forEach((group) => {
      let groupShown = 0;
      // A single-record group carries the search text itself; a folded one, on each record.
      const items = group.dataset.search ? [group] : [...group.querySelectorAll<HTMLElement>("[data-search]")];
      items.forEach((item) => {
        const match = words.every((word) => item.dataset.search!.includes(word));
        if (item !== group) item.hidden = !match;
        if (match) groupShown++;
      });
      group.hidden = groupShown === 0;
      shown += groupShown;
      // While filtering, open the groups that still have matches.
      const details = group.querySelector("details");
      if (details && words.length) details.open = groupShown > 0;
    });
    const total = project.records.length;
    const blocks = project.blocks;
    const parts = [
      words.length ? `${shown} of ${total} shown` : `${total - blocks} ${total - blocks === 1 ? "record" : "records"}, ${blocks} ${blocks === 1 ? "block" : "blocks"}`,
    ];
    if (project.moreRecords > 0) parts.push(`${project.moreRecords} more IDs not looked up`);
    // Blocks but no records: the token's role most likely cannot read any model.
    if (blocks > 0 && blocks === total) parts.push("no records readable: give the token's role read access to the models");
    const note = root.querySelector<HTMLElement>(".records-note")!;
    note.textContent = parts.join(", ") + ".";
    note.hidden = false;
  }

  /** The "i" at the end of a query line: what the figures mean. A click on it must not fold the row. */
  private weightInfo(n: number): HTMLElement {
    const info = document.createElement("span");
    info.className = "info";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "i";
    button.textContent = "i";
    button.setAttribute("aria-label", "About these figures");
    button.setAttribute("aria-describedby", `weight-tip-${n}`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    const tip = document.createElement("span");
    tip.className = "tip tip-end";
    tip.id = `weight-tip-${n}`;
    tip.setAttribute("role", "tooltip");
    for (const line of WEIGHT_HELP) {
      const row = document.createElement("span");
      row.className = "tip-line";
      const term = document.createElement("strong");
      term.textContent = line[0];
      row.append(term, ` ${line[1]}`);
      tip.append(row);
    }
    info.append(button, tip);
    return info;
  }

  private codeBlock(title: string, code: string): HTMLElement {
    const block = document.createElement("div");
    block.className = "code";
    const head = document.createElement("div");
    head.className = "code-head";
    const label = document.createElement("span");
    label.textContent = title;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Copy failed";
      }
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    });
    head.append(label, copy);
    const pre = document.createElement("pre");
    pre.textContent = code;
    block.append(head, pre);
    return block;
  }

  private commit(next: DevPreviewState) {
    if (!this.cookiesOk) return;
    if (next.mode === this.state.mode && next.visualEditing === this.state.visualEditing) return;
    writeCookie(document, MODE_COOKIE, next.mode);
    writeCookie(document, VISUAL_COOKIE, serializeVisual(next.visualEditing));
    this.state = next;
    this.update();
    const detail: ChangeDetail = { mode: next.mode, visualEditing: next.mode === "draft" && next.visualEditing };
    const proceed = this.dispatchEvent(
      new CustomEvent<ChangeDetail>(CHANGE_EVENT, { detail, bubbles: true, composed: true, cancelable: true }),
    );
    if (proceed && this.getAttribute("reload") !== "false") location.reload();
  }

  private handleKeydown(event: KeyboardEvent) {
    const action = shortcutFor(event, isEditableTarget(event.composedPath()[0] ?? event.target));
    if (!action) return;
    event.preventDefault();
    if (action === "toggle-bar") this.setOpen(!this.open);
    else if (action === "toggle-mode") this.commit({ ...this.state, mode: this.state.mode === "draft" ? "published" : "draft" });
    else if (this.state.mode === "draft") this.commit({ ...this.state, visualEditing: !this.state.visualEditing });
  }
}

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    sessionStorage.setItem(key, on ? "1" : "0");
  } catch {
    // Without sessionStorage the bar starts closed on every page; everything else works.
  }
}

function readTab(): string {
  try {
    const tab = sessionStorage.getItem(TAB_KEY);
    return tab && TAB_KEYS.includes(tab) ? tab : "general";
  } catch {
    return "general";
  }
}

/** The site hands the data over in <script type="application/json" data-datocms-dev-bar>. */
function readData() {
  const script = document.querySelector('script[type="application/json"][data-datocms-dev-bar]');
  return parseDevBarData(script?.textContent);
}

const LINK_ATTRIBUTES = ["data-datocms-content-link-url", "data-datocms-auto-content-link-url"];

/**
 * Elements of the page that Content Link ties to a record, or to a block inside it (its field path
 * starts with the block's). Visible ones only. Repeated clicks walk through them.
 */
function placesOf(anchor: { recordId: string; fieldPath: string }): HTMLElement[] {
  const needle = `/items/${anchor.recordId.replace(/["\\]/g, "\\$&")}/`;
  const selector = LINK_ATTRIBUTES.map((name) => `[${name}*="${needle}"]`).join(",");
  return [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => {
    if (el.getClientRects().length === 0) return false;
    if (!anchor.fieldPath) return true;
    const url = LINK_ATTRIBUTES.map((name) => el.getAttribute(name)).find(Boolean) ?? "";
    const path = decodeURIComponent(url.split("fieldPath=")[1] ?? "");
    return path === anchor.fieldPath || path.startsWith(`${anchor.fieldPath}.`);
  });
}

// A pencil, drawn in the text colour. Static markup: no data goes into it.
const EDIT_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3L5 14H2v-3z"/><path d="M9 4l3 3"/></svg>';

const STATUS_LABEL = { published: "published", updated: "unpublished changes", draft: "draft", unknown: "unknown" };

function ago(iso: string | null): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return "";
  const seconds = Math.round((time - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return "just now";
}

type ModelGroup = { name: string; block: boolean; records: RecordInfo[] };

/** Records of the same model together, in the order the page first shows each model. */
function groupByModel(records: RecordInfo[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const record of records) {
    const name = record.model ?? record.modelApiKey ?? "(unknown model)";
    const key = record.modelApiKey ?? name;
    const group = groups.get(key) ?? { name, block: record.block, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const span = (className: string, text: string) => {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
};

/** A model: one line with its name and count; more than one record opens to the list. */
function groupItem(group: ModelGroup): HTMLElement {
  const item = document.createElement("li");
  item.className = "r-group";
  const head = [span("r-model", group.name)];
  if (group.block) head.push(span("r-block", "block"));
  if (group.records.length === 1) {
    // A single record needs no folding: the model on the first line, its title under it.
    const row = recordItem(group.records[0], head);
    item.dataset.search = row.dataset.search;
    row.removeAttribute("data-search");
    item.append(row);
    return item;
  }
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.append(...head, span("r-count", `×${group.records.length}`));
  const pending = group.records.filter((r) => r.status === "updated" || r.status === "draft").length;
  if (pending > 0) summary.append(dot("updated", `${pending} not published`));
  const list = document.createElement("ul");
  list.className = "r-items";
  list.append(...group.records.map((record) => recordItem(record)));
  details.append(summary, list);
  item.append(details);
  return item;
}

function el(tag: string, className?: string, content?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** A coloured dot for a status; the words go to the tooltip and to screen readers. */
function dot(status: string, label: string): HTMLElement {
  const node = document.createElement("span");
  node.className = "r-dot";
  node.dataset.status = status;
  node.title = label;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", label);
  return node;
}

/**
 * One record: status dot, then two lines, the heading (the model when `head` is given, else the title)
 * with the last change, and the title under it; the edit link on the right. Text only, never HTML.
 */
function recordItem(record: RecordInfo, head?: HTMLElement[]): HTMLElement {
  const item = document.createElement("li");
  item.className = "r-rec";
  const title = record.title ? span("r-title", record.title) : null;
  if (title) title.title = record.title!;
  const when = span("r-when", ago(record.updatedAt));
  if (record.updatedAt) when.title = `Updated ${record.updatedAt}`;
  item.dataset.search = [record.model, record.modelApiKey, record.title, record.block ? "block" : "record", STATUS_LABEL[record.status]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const main = document.createElement("div");
  main.className = "r-main";
  const top = document.createElement("div");
  top.className = "r-head";
  if (head) {
    top.append(...head, when);
    main.append(top);
    if (title) main.append(title);
  } else {
    if (title) top.append(title);
    top.append(when);
    main.append(top);
  }
  // With Content Link on, the page marks the elements each record fills: a click scrolls to them.
  const anchor = record.anchor;
  if (anchor && placesOf(anchor).length) {
    main.classList.add("r-findable");
    main.tabIndex = 0;
    main.setAttribute("role", "button");
    main.title = "Show on the page";
    let next = 0;
    const show = () => {
      const places = placesOf(anchor);
      if (!places.length) return;
      const target = places[next % places.length];
      next++;
      // Into the top fifth of the screen: the panel sits at the bottom and would cover the middle.
      const top = target.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.2;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      target.animate(
        [
          { outline: "3px solid #FF593D", outlineOffset: "4px" },
          { outline: "3px solid transparent", outlineOffset: "4px" },
        ],
        { duration: 1800, easing: "ease-out" },
      );
    };
    main.addEventListener("click", show);
    main.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        show();
      }
    });
  }
  item.append(dot(record.status, STATUS_LABEL[record.status]), main);
  if (record.editUrl) {
    const link = document.createElement("a");
    link.className = "r-edit";
    link.href = record.editUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "Edit in DatoCMS";
    link.setAttribute("aria-label", "Edit in DatoCMS (opens in a new window)");
    link.innerHTML = EDIT_ICON;
    item.append(link);
  }
  return item;
}
