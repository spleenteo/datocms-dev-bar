# datocms-dev-bar: design

Data: 2026-10-02
Stato: bozza da rivedere. La sezione 1 (contratto) è approvata in conversazione; le sezioni 2-7 aspettano la revisione.

## Obiettivo

Uno strumento per chi sviluppa siti DatoCMS in locale, spesso con Claude acceso e un browser su localhost. Serve a due cose:

1. passare in un clic tra contenuti draft e published, perché cambiano quello che la pagina mostra e servono entrambi;
2. accendere e spegnere il visual editing (Content Link), perché i riquadri arancioni aiutano quando si modifica un contenuto e disturbano quando si sviluppa.

Più un link al progetto DatoCMS, che si apre in una nuova finestra.

È riuscito se aggiungerlo a un progetto nuovo richiede pochi minuti e una manciata di righe, in qualsiasi framework.

### Vincoli

- Solo sviluppo locale. In produzione non fa niente, nemmeno se finisce nel bundle.
- Indipendente dal framework: Astro, Next.js, Nuxt, SvelteKit, HTML puro.
- Nessuna dipendenza: niente Tailwind, niente librerie di UI, niente runtime esterni.
- Nato dalla barra delle bozze di gestart-astro (`src/components/DraftModeBanner`), da cui eredita forma e comportamento.

### Fuori da questa versione

- Produzione e editor: cookie firmati, gettoni di Web Previews, sessioni DatoCMS.
- Raggi X (vedi sezione 7).
- Estensione per il browser (vedi sezione 7).
- Cambio di environment DatoCMS: resta configurazione del progetto.

## Architettura in breve

Tre pezzi, ognuno usabile da solo:

| Pezzo | Dove gira | Cosa fa |
|---|---|---|
| Contratto | documentazione | nomi e valori di cookie e parametri URL |
| `<datocms-dev-bar>` | browser | l'interfaccia: scrive i cookie e ricarica |
| `datocms-dev-bar/server` | server del sito | legge cookie e parametri, restituisce le opzioni per la CDA |

Il widget non chiama endpoint e non conosce i token. Il sito non conosce il widget: legge solo due cookie. Chi non vuole il nostro helper implementa il contratto a mano.

## 1. Il contratto (approvato)

### Cookie

Scritti dal widget con `path=/`, `SameSite=Lax`, senza scadenza (cookie di sessione).

| Cookie | Valori | Default se assente o non valido | Effetto sulla query |
|---|---|---|---|
| `datocms-mode` | `draft` \| `published` | `draft` | `draft` → `includeDrafts: true` |
| `datocms-visual` | `on` \| `off` | `on` | `on` e mode `draft` → `contentLink: "v1"` e `baseEditingUrl` |

- Il visual editing vale solo in draft. Sul pubblicato l'interruttore appare disattivato.
- Spegnere il visual editing non richiede niente lato client: senza metadati nella risposta lo script degli overlay non ha niente da evidenziare.

### Parametri URL

`?datocms=draft|published` e `?datocms-visual=on|off`.

- Il server li legge per primi, prima dei cookie, così la prima risposta è già quella giusta. Fa parte del contratto: chi lo implementa a mano legge anche i parametri.
- Il widget, al caricamento, li copia nei cookie e li toglie dall'URL con `history.replaceState`, senza ricaricare. Le pagine successive leggono il cookie.
- Il widget non può sapere che cosa ha mostrato il server, quindi non prova a correggerlo. Un sito che ignora i parametri mostra la versione sbagliata solo su quella prima pagina.

Uso tipico con Claude: aprire `http://localhost:4321/chi-siamo?datocms=published` per vedere la pagina pubblicata.

### Corrispondenza con la CDA

| Stato | `@datocms/cda-client` | header HTTP grezzi |
|---|---|---|
| draft | `includeDrafts: true` | `X-Include-Drafts: true` |
| draft + visual on | `contentLink: "v1"`, `baseEditingUrl` | `X-Visual-Editing: v1`, `X-Base-Editing-Url: <url>` |
| published | nessuna opzione | nessun header |

Con `X-Include-Drafts` basta un solo token, purché abbia accesso alle bozze.

### Sicurezza

- L'helper restituisce sempre "published, senza Content Link" se non riceve `isDev: true`. Un cookie scritto a mano su un sito in produzione non apre le bozze.
- Il widget non si mostra se `location.hostname` non è `localhost`, `127.0.0.1`, `[::1]` o un host che finisce in `.local`, `.localhost` o `.test`, salvo host aggiunti con l'attributo `allow-hosts`.

## 2. Il web component `<datocms-dev-bar>`

### Uso

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/datocms-dev-bar"></script>
<datocms-dev-bar project-url="https://mio-progetto.admin.datocms.com"></datocms-dev-bar>
```

Oppure da npm: `import "datocms-dev-bar"` registra l'elemento.

### Attributi

| Attributo | Default | Significato |
|---|---|---|
| `project-url` | nessuno | URL dell'admin DatoCMS. Senza, il link al progetto non compare |
| `environment` | nessuno | se presente, il link punta a `<project-url>/environments/<environment>` |
| `position` | `bottom-left` | `bottom-left` \| `bottom-right`: lato su cui sta la linguetta |
| `reload` | `true` | `false` per i siti che gestiscono il cambio da soli (vedi Eventi) |
| `allow-hosts` | nessuno | host in più, separati da spazio, dove il widget si mostra |
| `shortcuts` | `on` | `off` per disattivare le scorciatoie da tastiera |

Colore e posizione verticale si regolano con proprietà CSS sull'elemento: `--dev-bar-accent` (default `#FF593D`), `--dev-bar-bottom` (default `12px`).

### Forma

Ereditata da gestart-astro:

- **Linguetta**: mezzaluna di 24×48 px attaccata al bordo dello schermo, colore accent, con un pallino bianco di 16 px tagliato a metà dal bordo: la D di DatoCMS. Sta sopra la barra (z-index superiore) anche da aperta.
- **Stato leggibile a barra chiusa**: in draft il pallino è pieno, in published diventa un anello. Si capisce cosa si sta guardando senza aprire niente.
- **Barra**: nera, arrotondata, scorre fuori dal bordo al clic sulla linguetta e rientra al secondo clic. Contiene, in ordine:
  1. `Viewing` con l'interruttore `draft` | `published`;
  2. `Visual editing` con l'interruttore `on` | `off`, disattivato in published;
  3. `DatoCMS ↗`, se c'è `project-url`.
- **Apertura**: solo al clic, con lo stato in `sessionStorage` (chiave `datocms-dev-bar:open`), così resta aperta dopo il ricaricamento causato da un interruttore.
- Su schermi stretti la barra va a capo, come oggi.
- Con `prefers-reduced-motion` niente animazione di scorrimento, solo dissolvenza.

### Scorciatoie da tastiera

- `Alt+Shift+D`: alterna draft e published.
- `Alt+Shift+V`: alterna visual editing on e off.
- `Alt+Shift+B`: apre e chiude la barra.

Ignorate quando il focus è in un campo di testo.

### Isolamento

Shadow DOM con il proprio `<style>`. Il CSS del sito non entra, quello del widget non esce. Nessun font esterno: `system-ui`.

### Eventi

Prima di ricaricare, l'elemento emette `datocms-dev-bar:change` con `detail: { mode, visualEditing }`. L'evento è annullabile: con `preventDefault()`, o con `reload="false"`, il widget scrive i cookie ma non ricarica. Serve alle app che preferiscono un aggiornamento morbido, per esempio `router.refresh()` in Next.js.

### Accessibilità

- Linguetta: `<button>` con `aria-expanded` e `aria-controls`, etichetta "DatoCMS dev bar".
- Interruttori: gruppi di pulsanti con `aria-pressed`.
- Link al progetto: `target="_blank" rel="noopener"` e testo nascosto "(opens in a new window)".

### Dimensioni

Obiettivo: meno di 6 KB compressi.

## 3. L'helper lato server `datocms-dev-bar/server`

Funzioni pure, senza dipendenze, che funzionano in Node, Workers, Deno e Bun.

```ts
import { readDevPreview } from "datocms-dev-bar/server";

const preview = readDevPreview(request, { isDev: import.meta.env.DEV });
// { mode: "draft" | "published", visualEditing: boolean }

const options = preview.cdaOptions({ baseEditingUrl: "https://mio-progetto.admin.datocms.com" });
// per @datocms/cda-client: { includeDrafts, contentLink?, baseEditingUrl? }

const headers = preview.headers({ baseEditingUrl: "https://mio-progetto.admin.datocms.com" });
// per fetch grezzo: { "X-Include-Drafts": "true", "X-Visual-Editing": "v1", ... }
```

- **Input**: un `Request`, oppure un oggetto `{ cookie?: string | null; url?: string | URL; searchParams?: URLSearchParams | Record<string, string | string[] | undefined> }` per i framework che danno cookie e URL separati (Next.js App Router).
- **Ordine di lettura**: parametro URL, poi cookie, poi default.
- **Fuori sviluppo** (`isDev` assente o `false`): `{ mode: "published", visualEditing: false }`, sempre.
- **Non lancia mai errori**: valori sconosciuti diventano default.

### Ricette nella documentazione

Una pagina per framework, con lo snippet minimo:

- **Astro**: `readDevPreview(Astro.request, { isDev: import.meta.env.DEV })` nel punto dove si fa la query; widget nel layout dentro `{import.meta.env.DEV && ...}`.
- **Next.js App Router**: `readDevPreview({ cookie: (await headers()).get("cookie"), searchParams: await searchParams }, { isDev: process.env.NODE_ENV === "development" })` nella pagina, che riceve `searchParams` come prop. I layout non li ricevono: lì vale solo il cookie. Widget in un Client Component caricato solo in sviluppo.
- **Nuxt**: `readDevPreview(toWebRequest(event), { isDev: import.meta.dev })`.
- **SvelteKit**: `readDevPreview(event.request, { isDev: dev })`.
- **Contratto a mano**: tabella dei cookie e degli header, per qualsiasi altro stack.

Nota comune: in draft la risposta non va messa in cache. La documentazione lo dice; l'helper non tocca la cache del framework.

## 4. Distribuzione

- Un solo pacchetto npm, `datocms-dev-bar`, con due entry point:
  - `datocms-dev-bar` registra l'elemento (effetto collaterale, `customElements.define` protetto contro la doppia registrazione);
  - `datocms-dev-bar/server` esporta l'helper.
- Un file IIFE per il CDN (jsDelivr, unpkg), per l'uso con un `<script>` in HTML puro.
- Sorgenti in TypeScript, build con esbuild, tipi `.d.ts` inclusi. Nessuna dipendenza di runtime.
- Le ricette consigliano di caricare il widget solo in sviluppo (import condizionale o dinamico), così non finisce nel bundle di produzione. Il controllo sull'host resta come seconda cintura.
- Licenza MIT, repository pubblico.

### Primo progetto che lo usa

gestart-astro: la barra di `src/components/DraftModeBanner` in sviluppo lascia il posto al pacchetto. In produzione resta la barra attuale, con il cookie firmato, che è fuori perimetro.

## 5. Casi limite ed errori

| Caso | Comportamento |
|---|---|
| Host non ammesso | l'elemento non disegna niente; un solo `console.info` che spiega perché |
| Cookie bloccati | la barra mostra "cookies blocked": gli interruttori non funzionerebbero |
| Due elementi nella pagina | il secondo non si disegna |
| Valore di cookie sconosciuto | trattato come default |
| `sessionStorage` non disponibile | la barra parte chiusa a ogni pagina, il resto funziona |
| Sito che ignora il contratto | gli interruttori cambiano i cookie ma la pagina resta uguale. La documentazione lo spiega in apertura |

## 6. Verifica

### Dove si vede la barra mentre la si sviluppa

Tre livelli, dal più rapido al più realistico:

1. **Playground nel repo**: `npm run dev` avvia un piccolo server Node su `http://localhost:5173` che ricompila il widget a ogni salvataggio (esbuild in watch) e serve una pagina di prova. La pagina è generata lato server con l'helper vero, e mostra in chiaro cosa ha deciso: "server: draft, visual editing on". Il contenuto è finto, con testi che portano metadati Content Link simulati, così si vedono anche gli overlay accendersi e spegnersi. Non serve un progetto DatoCMS.
2. **Playground con dati veri**: se in `.env` c'è un token CDA, la stessa pagina interroga un progetto DatoCMS reale invece dei dati finti.
3. **In un sito vero**: il pacchetto si collega a gestart-astro con una dipendenza locale (`"datocms-dev-bar": "file:../datocms-dev-bar"`) e si vede su `localhost:4321`, al posto della barra attuale.

### Test

- **Helper**: test unitari con Vitest. Sono funzioni pure, quindi i test costano poco: ordine di lettura, default, `isDev` falso, valori sconosciuti, i tre formati di input.
- **Web component**: test con Playwright su una pagina HTML statica servita in locale: apertura e chiusura, scrittura dei cookie, parametri URL tolti dall'URL, scorciatoie, controllo dell'host.
- **Esempi**: una cartella `examples/` con HTML puro e Astro, usati anche come prova manuale prima di ogni rilascio. Il playground del punto 1 è l'esempio HTML.

## 7. Direzioni future (non in v1)

La v1 non deve chiudere queste strade.

- **Raggi X**: con il visual editing acceso, ogni testo porta nascosto il link all'editor DatoCMS (ID del modello, ID del record, percorso del campo). Un pannello del widget può leggerlo ed evidenziare record e blocchi. Per mostrare i *nomi* di modelli e blocchi serve un token con accesso allo schema, oppure `_modelApiKey` nelle query. La barra della v1 prevede un punto dove aggiungere un terzo gruppo, senza essere riscritta.
- **Estensione per il browser**: lo stesso web component inserito su qualsiasi localhost, per chi ha l'helper nel progetto e non vuole aggiungere lo script. Per i raggi X l'estensione ha un vantaggio: legge i metadati senza passare dal server.
- **Produzione per gli editor**: cookie firmato e gettone di Web Previews, come in gestart-astro. Richiede codice lato server per ogni framework e va progettata a parte.

## Domande aperte

Decise: colore `#FF593D`; pacchetto npm.

1. Nome del pacchetto: `datocms-dev-bar` senza scope, o con uno scope (`@spleenteo/…` o di un'organizzazione)?
2. Le scorciatoie `Alt+Shift+D/V/B` possono scontrarsi con quelle di qualche sistema o IDE nel browser: le teniamo attive di default?
