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
import type { ProjectInfo } from "../project";
import {
  NOT_AVAILABLE,
  assessReport,
  blockRows,
  cacheState,
  describeWeight,
  flaggedCount,
  groupReports,
  parseDevBarData,
  summarizeReports,
  type QueryReport,
  type SummaryRows,
} from "../queries";
import { cookiesWork, writeCookie } from "./cookies";
import { el } from "./dom";
import { isAllowedHost } from "./hosts";
import { environmentInfo, projectHref } from "./links";
import { takeUrlParams } from "./params";
import { markFindable, recordGroups } from "./records";
import { isEditableTarget, shortcutFor } from "./shortcuts";
import { recall, remember } from "./storage";
import { STYLES } from "./styles";
import { TABS, TEMPLATE } from "./template";

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
const OUTLINES_KEY = "datocms-dev-bar:outlines";
/** Emitted by @datocms/content-link on the document when its click-to-edit outlines turn on or off. */
const OUTLINES_EVENT = "datocms:click-to-edit:toggle";
const TAB_KEYS = TABS.map((tab) => tab.key);

// On the server there is no HTMLElement: importing this module must still work.
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as unknown as typeof HTMLElement;

let activeInstance: DevBar | null = null;
let refusalLogged = false;

export class DevBar extends Base {
  static observedAttributes = ["project-url", "environment", "environment-primary", "position", "data-url"];

  private state: DevPreviewState = { ...DEFAULT_STATE };
  private open = false;
  private advanced = false;
  private reports: QueryReport[] = [];
  private project: ProjectInfo | null = null;
  /** The environment the queries say answered; null when they did not say. */
  private answered: string | null = null;
  private recordFilter = "";
  private tab = "general";
  /** Whether Content Link outlines are on; null until the bar has seen them change. */
  private outlines: boolean | null = null;
  private cookiesOk = true;
  private root: ShadowRoot | null = null;
  private readonly onKeydown = (event: KeyboardEvent) => this.handleKeydown(event);
  private readonly onOutlines = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== "boolean") return;
    this.outlines = detail;
    remember(OUTLINES_KEY, detail ? "1" : "0");
    if (this.root) this.update();
  };

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
    this.open = recall(OPEN_KEY) === "1";
    this.advanced = recall(ADVANCED_KEY) === "1";
    const tab = recall(TAB_KEY);
    this.tab = tab && TAB_KEYS.includes(tab) ? tab : "general";
    // The site's controller may have set its state before the bar loaded: start from the last one seen.
    const seen = recall(OUTLINES_KEY);
    this.outlines = seen === null ? null : seen === "1";
    document.addEventListener(OUTLINES_EVENT, this.onOutlines);
    if (this.getAttribute("shortcuts") !== "off") window.addEventListener("keydown", this.onKeydown);
    ({ queries: this.reports, project: this.project } = readData());
    this.render();
    void this.loadRemoteData();
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onKeydown);
    document.removeEventListener(OUTLINES_EVENT, this.onOutlines);
    if (activeInstance === this) activeInstance = null;
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (!this.root) return;
    if (name === "data-url" && previous !== next) void this.loadRemoteData();
    else this.update();
  }

  /**
   * With data-url the bar asks the site for its data, instead of reading it from the page: for
   * frameworks that stream the page while the queries still run (Next.js), and for navigations
   * that do not reload the page (the site changes the attribute, the bar asks again).
   * The response has the same shape as the inline script.
   */
  private async loadRemoteData() {
    const url = this.getAttribute("data-url");
    if (!url) return;
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`answered ${response.status}`);
      const body = await response.text();
      if (url !== this.getAttribute("data-url")) return; // the site pointed the bar elsewhere in the meantime
      ({ queries: this.reports, project: this.project } = parseDevBarData(body));
      this.renderData();
    } catch (error) {
      console.info(`[datocms-dev-bar] could not load ${url}: ${error instanceof Error ? error.message : error}`);
    }
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

  /** Builds the bar once and wires its controls. */
  private render() {
    this.root ??= this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style>${TEMPLATE}`;
    this.root.querySelector(".tab")!.addEventListener("click", () => this.setOpen(!this.open));
    this.root.querySelector<HTMLInputElement>(".records-filter")!.addEventListener("input", (event) => {
      this.recordFilter = (event.target as HTMLInputElement).value;
      this.applyRecordFilter();
    });
    this.root.querySelector(".advanced")!.addEventListener("click", () => this.setAdvanced(!this.advanced));
    // Tooltips are placed when their "i" is reached, by pointer or by keyboard.
    for (const type of ["mouseover", "focusin"] as const) {
      this.root.addEventListener(type, (event) => {
        const info = (event.target as Element | null)?.closest?.(".info");
        if (info) placeTip(info as HTMLElement);
      });
    }
    // The buttons at the end of the General sections open the Queries and Records tabs.
    this.root.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((button) =>
      button.addEventListener("click", () => {
        this.setTab(button.dataset.go!);
        this.root!.querySelector<HTMLElement>(`[data-pane="${button.dataset.go}"] summary`)?.focus({ preventScroll: true });
      }),
    );
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
    this.renderData();
  }

  /**
   * Fills the X-Ray panel with what the site handed over: the figures, the queries, the records.
   * Runs when the data arrives, not on every click: what is open or scrolled in the panel stays so.
   * Values go in as text, never as HTML.
   */
  private renderData() {
    const root = this.root!;
    const summary = summarizeReports(this.reports);
    const none = this.reports.length === 0;
    this.answered = none || summary.environment === NOT_AVAILABLE ? null : summary.environment;
    // Environment comes from the attributes too, the Records section from the project data: both in update().
    root.querySelectorAll<HTMLElement>("[data-row]").forEach((cell) => {
      const key = cell.dataset.row as keyof SummaryRows;
      if (key in summary && key !== "environment") cell.textContent = summary[key];
    });
    root.querySelector<HTMLElement>(".cache-dot")!.dataset.cache = cacheState(this.reports);
    root.querySelectorAll<HTMLElement>(".empty").forEach((note) => (note.hidden = !none));
    root.querySelectorAll<HTMLElement>("[data-queries]").forEach((row) => (row.hidden = none));
    const flagged = flaggedCount(this.reports);
    const flaggedNote = root.querySelector<HTMLElement>(".flagged")!;
    flaggedNote.hidden = flagged === 0;
    flaggedNote.querySelector(".flag")!.textContent = `${flagged} flagged`;
    const project = this.project && !this.project.error ? this.project : null;
    const counts: Record<string, number | null> = { records: project ? project.records.length : null, queries: this.reports.length };
    root.querySelectorAll<HTMLElement>("[data-count]").forEach((badge) => {
      const value = counts[badge.dataset.count!];
      badge.textContent = value ? String(value) : "";
      badge.hidden = !value;
    });
    root.querySelectorAll<HTMLElement>("[data-project]").forEach((node) => (node.hidden = project === null));
    if (project) {
      const rows = blockRows(project);
      for (const key of ["records", "blocks", "heaviest"] as const) root.querySelector<HTMLElement>(`[data-row="${key}"]`)!.textContent = rows[key];
    }
    const list = root.querySelector<HTMLElement>(".queries")!;
    list.hidden = none;
    const groups = groupReports(this.reports);
    list.replaceChildren(...groups.map((group, index) => this.queryItem(group.report, group.count, index, groups.length === 1)));
    this.renderRecords();
    this.update();
  }

  /** Applies the state of the bar (open, mode, tab, attributes) to what is already drawn. */
  private update() {
    const root = this.root!;
    const wrap = root.querySelector<HTMLElement>(".wrap")!;
    wrap.dataset.position = this.getAttribute("position") === "bottom-right" ? "right" : "left";
    wrap.dataset.mode = this.state.mode;
    wrap.toggleAttribute("data-open", this.open);
    wrap.toggleAttribute("data-advanced", this.advanced);
    root.querySelector(".advanced")!.setAttribute("aria-expanded", String(this.advanced));
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
    root.querySelector<HTMLElement>(".warning")!.hidden = this.cookiesOk;
    // Outlines exist only on drafts with Content Link: the state is read, not set (the site owns it).
    const outlines = root.querySelector<HTMLElement>(".outlines")!;
    outlines.hidden = published || !this.state.visualEditing;
    outlines.dataset.state = this.outlines === null ? "unknown" : this.outlines ? "on" : "off";
    root.querySelector<HTMLElement>(".outlines-label")!.textContent =
      this.outlines === null ? "Outlines: hold Alt" : this.outlines ? "Outlines on" : "Outlines off";

    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      const selected = button.dataset.tab === this.tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll<HTMLElement>("[data-pane]").forEach((pane) => (pane.hidden = pane.dataset.pane !== this.tab));

    const href = projectHref(this.getAttribute("project-url"), this.getAttribute("environment"));
    const link = root.querySelector<HTMLAnchorElement>(".project")!;
    link.hidden = href === null;
    if (href !== null) link.href = href;
    // The environment that answered wins; without queries, the attribute, else the primary one.
    const env = environmentInfo(this.getAttribute("environment"), this.hasAttribute("environment-primary"));
    const shown = this.answered ?? env.name ?? "Primary environment";
    root.querySelector<HTMLElement>('[data-row="environment"]')!.textContent = shown;
    // With project data the badge is a fact; without, a guess from the attributes.
    const known = this.project?.environments.find((e) => e.name === shown);
    const primary = known ? known.primary : env.primary;
    const badge = root.querySelector<HTMLElement>(".badge")!;
    badge.dataset.primary = String(primary);
    badge.textContent = primary ? "primary" : "not primary";

    if (this.open && this.advanced && this.tab === "records") markFindable(root.querySelector<HTMLElement>(".records")!);
  }

  private setOpen(open: boolean) {
    this.open = open;
    remember(OPEN_KEY, open ? "1" : "0");
    this.update();
  }

  private setTab(tab: string) {
    if (!TAB_KEYS.includes(tab)) return;
    this.tab = tab;
    remember(TAB_KEY, tab);
    this.update();
  }

  private setAdvanced(advanced: boolean) {
    this.advanced = advanced;
    remember(ADVANCED_KEY, advanced ? "1" : "0");
    this.update();
  }

  /**
   * In Queries: a section per query, with how many times it ran and its flags in the header; inside,
   * the figures, why it is flagged, and the text and variables to read and copy. A single query is open.
   */
  private queryItem(report: QueryReport, count: number, tipId: number, alone: boolean): HTMLElement {
    const flags = assessReport(report);
    const details = el("details", "sec");
    details.open = alone;
    const summary = el("summary");
    const head = el("span", "q-head");
    head.append(el("span", "q-name", report.operation ?? "(unnamed query)"));
    if (count > 1) head.append(el("span", "q-count", `×${count}`));
    for (const flag of flags) {
      const chip = el("span", "flag", flag.label);
      chip.dataset.kind = flag.kind;
      chip.title = flag.why;
      head.append(chip);
    }
    summary.append(head);
    const body = el("div", "sec-body");
    const weight = describeWeight(report);
    const line = el("div", "q-weight");
    line.append(el("span", "q-figures", `${weight.time} · ${weight.size} · cx ${weight.complexity} · len ${weight.length} · ${report.cache}`), weightInfo(tipId));
    body.append(line);
    for (const flag of flags) body.append(el("p", "q-why", flag.why));
    if (report.query) body.append(codeBlock("Query", report.query));
    if (report.variables) body.append(codeBlock("Variables", report.variables));
    if (!report.query) body.append(el("p", "q-why", "The site did not hand over the query text."));
    details.append(summary, body);
    return details;
  }

  private renderRecords() {
    const root = this.root!;
    const project = this.project;
    let message = "";
    if (!project) message = "Add a read-only Content Management API token on the server to see them: see the README.";
    else if (project.error) message = `Could not read the project: ${project.error}`;
    else if (project.records.length === 0) message = "No records found in this page's queries.";
    root.querySelector<HTMLElement>(".records-note-text")!.textContent = message;
    const note = root.querySelector<HTMLElement>(".project-note")!;
    note.textContent = message;
    note.hidden = message === "";
    const records = project?.records ?? [];
    root.querySelector<HTMLElement>(".records-filter-wrap")!.hidden = records.length === 0;
    root.querySelector<HTMLInputElement>(".records-filter")!.value = this.recordFilter;
    root.querySelector<HTMLElement>(".records")!.replaceChildren(...recordGroups(records));
    // Every block inside these records, by model, all locales
    const counts = project && !project.error ? project.blockCounts : [];
    const box = root.querySelector<HTMLDetailsElement>(".block-counts")!;
    box.hidden = counts.length === 0;
    box.open = false;
    const total = counts.reduce((sum, b) => sum + b.count, 0);
    root.querySelector<HTMLElement>(".block-total")!.textContent = `Blocks by model · ${total}`;
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
    root.querySelectorAll<HTMLDetailsElement>(".r-group").forEach((group) => {
      let groupShown = 0;
      group.querySelectorAll<HTMLElement>("[data-search]").forEach((item) => {
        const match = words.every((word) => item.dataset.search!.includes(word));
        item.hidden = !match;
        if (match) groupShown++;
      });
      group.hidden = groupShown === 0;
      shown += groupShown;
      // While filtering, open the groups that still have matches.
      if (words.length) group.open = groupShown > 0;
    });
    const total = project.records.length;
    const blocks = project.blocks;
    const parts = [
      words.length ? `${shown} of ${total} shown` : `${total - blocks} ${total - blocks === 1 ? "record" : "records"}, ${blocks} ${blocks === 1 ? "block" : "blocks"}`,
    ];
    if (project.moreRecords > 0) parts.push(`${project.moreRecords} more IDs not looked up`);
    // Blocks but no records: the token's role most likely cannot read any model.
    if (blocks > 0 && blocks === total) parts.push("no records readable: give the token's role read access to the models");
    root.querySelector<HTMLElement>(".records-note-text")!.textContent = parts.join(", ") + ".";
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

/** The site hands the data over in <script type="application/json" data-datocms-dev-bar>. */
function readData() {
  const script = document.querySelector('script[type="application/json"][data-datocms-dev-bar]');
  return parseDevBarData(script?.textContent);
}

/**
 * Puts the tooltip of an "i" where it can be seen: above the icon when there is room, else below,
 * kept inside the viewport. Fixed coordinates: the panel scrolls and clips, the tooltip must not.
 */
function placeTip(info: HTMLElement) {
  const tip = info.querySelector<HTMLElement>(".tip");
  const anchor = info.querySelector<HTMLElement>(".i") ?? info;
  if (!tip) return;
  const at = anchor.getBoundingClientRect();
  const size = tip.getBoundingClientRect();
  const margin = 8;
  const above = at.top - size.height - margin;
  const top = above >= margin ? above : Math.min(at.bottom + margin, window.innerHeight - size.height - margin);
  const left = Math.max(margin, Math.min(at.right - size.width, window.innerWidth - size.width - margin));
  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
}

/** The "i" at the end of a query line: what the figures mean. A click on it must not fold the row. */
function weightInfo(tipId: number): HTMLElement {
  const button = el("button", "i", "i");
  button.type = "button";
  button.setAttribute("aria-label", "About these figures");
  button.setAttribute("aria-describedby", `weight-tip-${tipId}`);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const tip = el("span", "tip");
  tip.id = `weight-tip-${tipId}`;
  tip.setAttribute("role", "tooltip");
  for (const [term, meaning] of WEIGHT_HELP) {
    const row = el("span", "tip-line");
    row.append(el("strong", undefined, term), ` ${meaning}`);
    tip.append(row);
  }
  const info = el("span", "info");
  info.append(button, tip);
  return info;
}

/** A query text or its variables, with a button to copy them. */
function codeBlock(title: string, code: string): HTMLElement {
  const copy = el("button", undefined, "Copy");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Copy failed";
    }
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  });
  const head = el("div", "code-head");
  head.append(el("span", undefined, title), copy);
  const block = el("div", "code");
  block.append(head, el("pre", undefined, code));
  return block;
}
