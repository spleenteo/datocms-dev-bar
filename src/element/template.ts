// The bar is a row of groups; future panels (X-ray) add a group here.
export const TEMPLATE = `
<div class="wrap" data-position="left" data-mode="draft">
  <button type="button" class="tab" aria-label="DatoCMS dev bar" aria-expanded="false" aria-controls="bar">
    <span class="dot"></span>
  </button>
  <div class="bar" id="bar">
    <span class="label"><span class="status" aria-hidden="true"></span>Viewing</span>
    <span class="group" role="group" aria-label="Content version">
      <button type="button" data-mode="draft">draft</button>
      <button type="button" data-mode="published">published</button>
    </span>
    <span class="sep" aria-hidden="true"></span>
    <span class="label">Visual editing</span>
    <span class="group" role="group" aria-label="Visual editing">
      <button type="button" data-visual="on">on</button>
      <button type="button" data-visual="off">off</button>
    </span>
    <span class="sep project-sep" aria-hidden="true"></span>
    <a class="project" target="_blank" rel="noopener">DatoCMS <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a>
    <span class="warning" role="status" hidden>cookies blocked</span>
  </div>
</div>
`;
