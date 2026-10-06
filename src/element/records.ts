import type { RecordInfo } from "../project";
import { safeDecode } from "../safeDecode";
import { el } from "./dom";

type Anchor = NonNullable<RecordInfo["anchor"]>;
type PageLink = Anchor & { element: HTMLElement };

const LINK_ATTRIBUTES = ["data-datocms-content-link-url", "data-datocms-auto-content-link-url"];
const LINK_SELECTOR = LINK_ATTRIBUTES.map((name) => `[${name}]`).join(",");
const RECORD_IN_LINK = /\/items\/([^/?#]+)/;
/** The colour of the outline drawn on the page, which the bar's own styles do not reach. */
const HIGHLIGHT = "#FF593D";

/** Every element of the page that Content Link ties to a record, by record ID. One pass over the page. */
function pageLinks(): Map<string, PageLink[]> {
  const links = new Map<string, PageLink[]>();
  for (const element of document.querySelectorAll<HTMLElement>(LINK_SELECTOR)) {
    const url = LINK_ATTRIBUTES.map((name) => element.getAttribute(name)).find(Boolean) ?? "";
    const match = RECORD_IN_LINK.exec(url);
    if (!match) continue;
    const recordId = safeDecode(match[1]);
    const fieldPath = safeDecode((url.split("fieldPath=")[1] ?? "").split("&")[0]);
    links.set(recordId, [...(links.get(recordId) ?? []), { element, recordId, fieldPath }]);
  }
  return links;
}

/**
 * The visible elements of a record, or of a block inside it (its field path starts with the block's).
 * Repeated clicks walk through them.
 */
function placesOf(anchor: Anchor, links = pageLinks()): HTMLElement[] {
  return (links.get(anchor.recordId) ?? [])
    .filter((link) => !anchor.fieldPath || link.fieldPath === anchor.fieldPath || link.fieldPath.startsWith(`${anchor.fieldPath}.`))
    .map((link) => link.element)
    .filter((element) => element.getClientRects().length > 0);
}

// The anchor of each row that could be found on the page, for `markFindable`.
const anchors = new WeakMap<HTMLElement, Anchor>();

/**
 * Marks the rows whose content is on the page right now: Content Link stamps its marks after the
 * page loads, and they go away without visual editing. Reads the page first, then writes the rows.
 */
export function markFindable(list: HTMLElement): void {
  const rows = [...list.querySelectorAll<HTMLElement>(".r-main")].filter((row) => anchors.has(row));
  if (rows.length === 0) return;
  const links = pageLinks();
  const found = rows.map((row) => placesOf(anchors.get(row)!, links).length > 0);
  rows.forEach((row, index) => {
    row.classList.toggle("r-findable", found[index]);
    if (found[index]) {
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.title = "Show on the page";
    } else {
      row.removeAttribute("tabindex");
      row.removeAttribute("role");
      row.removeAttribute("title");
    }
  });
}

// A pencil, drawn in the text colour. Static markup: no data goes into it.
const EDIT_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3L5 14H2v-3z"/><path d="M9 4l3 3"/></svg>';

const STATUS_LABEL = { published: "published", updated: "unpublished changes", draft: "draft", unknown: "unknown" };

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
let relativeTime: Intl.RelativeTimeFormat | undefined;

function ago(iso: string | null): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return "";
  const seconds = Math.round((time - Date.now()) / 1000);
  relativeTime ??= new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
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

/** The rows of the Records tab: one per model. */
export function recordGroups(records: RecordInfo[]): HTMLElement[] {
  return groupByModel(records).map(groupItem);
}

/** A model: one line with its name and count; more than one record opens to the list. */
function groupItem(group: ModelGroup): HTMLElement {
  const item = el("li", "r-group");
  const head = [el("span", "r-model", group.name)];
  if (group.block) head.push(el("span", "r-block", "block"));
  if (group.records.length === 1) {
    // A single record needs no folding: the model on the first line, its title under it.
    const row = recordItem(group.records[0], head);
    item.dataset.search = row.dataset.search;
    row.removeAttribute("data-search");
    item.append(row);
    return item;
  }
  const details = el("details");
  const summary = el("summary");
  summary.append(...head, el("span", "r-count", `×${group.records.length}`));
  const pending = group.records.filter((r) => r.status === "updated" || r.status === "draft").length;
  if (pending > 0) summary.append(dot("updated", `${pending} not published`));
  const list = el("ul", "r-items");
  list.append(...group.records.map((record) => recordItem(record)));
  details.append(summary, list);
  item.append(details);
  return item;
}

/** A coloured dot for a status; the words go to the tooltip and to screen readers. */
function dot(status: string, label: string): HTMLElement {
  const node = el("span", "r-dot");
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
  const item = el("li", "r-rec");
  const title = record.title ? el("span", "r-title", record.title) : null;
  if (title) title.title = record.title!;
  const when = el("span", "r-when", ago(record.updatedAt));
  if (record.updatedAt) when.title = `Updated ${record.updatedAt}`;
  // How many blocks the record holds, against the cap DatoCMS puts on one record.
  const blocks = record.blockCount ? el("span", "r-blocks", `${record.blockCount} ${record.blockCount === 1 ? "block" : "blocks"}`) : null;
  if (blocks) blocks.title = "Blocks in this record, nested and all locales";
  item.dataset.search = [record.model, record.modelApiKey, record.title, record.block ? "block" : "record", STATUS_LABEL[record.status]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const main = el("div", "r-main");
  const top = el("div", "r-head");
  if (head) {
    top.append(...head);
    if (blocks) top.append(blocks);
    top.append(when);
    main.append(top);
    if (title) main.append(title);
  } else {
    if (title) top.append(title);
    if (blocks) top.append(blocks);
    top.append(when);
    main.append(top);
  }
  if (record.anchor) makeFindable(main, record.anchor);
  item.append(dot(record.status, STATUS_LABEL[record.status]), main);
  if (record.editUrl) {
    const link = el("a", "r-edit");
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

/** With Content Link on, the page marks the elements each record fills: a click scrolls to them. */
function makeFindable(row: HTMLElement, anchor: Anchor): void {
  anchors.set(row, anchor);
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
        { outline: `3px solid ${HIGHLIGHT}`, outlineOffset: "4px" },
        { outline: "3px solid transparent", outlineOffset: "4px" },
      ],
      { duration: 1800, easing: "ease-out" },
    );
  };
  row.addEventListener("click", show);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show();
    }
  });
}
