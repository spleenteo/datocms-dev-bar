import { DevBar } from "./element/DevBar";

export { CHANGE_EVENT, DevBar, type ChangeDetail } from "./element/DevBar";
export * from "./contract";

export const TAG_NAME = "datocms-dev-bar";

declare global {
  interface HTMLElementTagNameMap {
    "datocms-dev-bar": DevBar;
  }
}

if (typeof customElements !== "undefined" && !customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, DevBar);
}
