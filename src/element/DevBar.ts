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
import { isAllowedHost } from "./hosts";
import { projectHref } from "./links";
import { takeUrlParams } from "./params";
import { isEditableTarget, shortcutFor } from "./shortcuts";
import { STYLES } from "./styles";
import { TEMPLATE } from "./template";

export const CHANGE_EVENT = "datocms-dev-bar:change";
/** `visualEditing` is the effective value: false in published mode. */
export type ChangeDetail = { mode: Mode; visualEditing: boolean };

const OPEN_KEY = "datocms-dev-bar:open";

// On the server there is no HTMLElement: importing this module must still work.
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as unknown as typeof HTMLElement;

let activeInstance: DevBar | null = null;
let refusalLogged = false;

export class DevBar extends Base {
  static observedAttributes = ["project-url", "environment", "position"];

  private state: DevPreviewState = { ...DEFAULT_STATE };
  private open = false;
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
    this.open = readOpen();
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
    root.querySelector<HTMLElement>(".project-sep")!.hidden = href === null;
    root.querySelector<HTMLElement>(".warning")!.hidden = this.cookiesOk;
  }

  private setOpen(open: boolean) {
    this.open = open;
    writeOpen(open);
    this.update();
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

function readOpen(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Without sessionStorage the bar starts closed on every page; everything else works.
  }
}
