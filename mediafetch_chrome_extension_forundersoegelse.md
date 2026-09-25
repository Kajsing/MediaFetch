# IT-forundersøgelse: MediaFetch Chrome Extension

**Status:** Revideret forundersøgelse  
**Dato:** 2026-09-25  
**Målgruppe:** Codex / udvikler  
**Primær platform:** Google Chrome / Chromium, Manifest V3  
**Primært OS:** Windows 11  
**Mål:** Ét klik på et opslag/video i browseren -> download til lokal maskine.

---

# 1. Executive summary

Projektet skal bygges som en **Chrome Extension**, ikke som et ChatGPT/MCP-plugin.

Den ønskede brugeroplevelse er:

```text
X / Reddit / evt. YouTube
        |
        | bruger klikker "Download"
        v
Chrome Extension
        |
        | identificerer canonical post/video URL
        v
Download Engine
        |
        v
Fil i brugerens Downloads-folder
```

Den vigtigste tekniske konklusion er, at der findes to mulige arkitekturer:

## A. Pure browser extension

Chrome-extensionen finder den direkte medie-URL og anvender `chrome.downloads`.

Fordele:
- ingen ekstra software
- simpel installation
- download ses i Chrome
- lille angrebsflade

Ulemper:
- fungerer kun godt, når der findes en direkte, komplet mediafil
- adaptive streams kan have video og audio separat
- HLS/DASH kræver segmenthåndtering og eventuel muxing
- siteændringer kan knække extraction
- YouTube bliver markant mere komplekst

## B. Chrome extension + lokal Native Messaging helper

Chrome-extensionen leverer UI og URL-detektion. En lille lokal helper anvender yt-dlp + ffmpeg.

Fordele:
- meget mere robust extraction
- Reddit/X/YouTube bruger samme backend
- ffmpeg kan samle audio/video
- yt-dlp vedligeholder platformextractors
- extension-koden forbliver lille
- nemmere at håndtere platformændringer

Ulemper:
- kræver en lokal installation
- Native Messaging host skal registreres på maskinen
- downloads fra helperen vises ikke automatisk som almindelige Chrome-downloads
- distribution er lidt mere kompleks

## Anbefalet løsning

Byg en **hybrid extension**:

1. Forsøg først direct download i browseren, når adapteren med høj sikkerhed finder en komplet direkte mediafil.
2. Hvis mediet kræver extraction, adaptive streaming eller muxing, send canonical URL til en lokal Native Messaging helper.
3. Helperen bruger yt-dlp og ffmpeg.
4. Extensionen viser resultat/status.

Det giver den bedste kombination af browseroplevelse og robusthed.

For et personligt/private-use projekt bør helperen betragtes som en normal del af løsningen, ikke som et nederlag.

---

# 2. Scope

## MVP

Understøt:

- X / Twitter
- Reddit
- Google Chrome / Chromium
- Manifest V3
- Windows 11
- ét opslag/video ad gangen
- browser toolbar action
- højreklik -> "Download video"
- inline download-knap på X/Reddit hvor det kan gøres robust
- automatisk provider-detektion
- direct-download når muligt
- Native Messaging fallback
- yt-dlp + ffmpeg i helper
- downloadstatus
- fejlhåndtering
- konfigureret download-folder
- kvalitetsvalg: Best / 1080p / 720p / Audio only senere

## YouTube

YouTube må gerne være med teknisk, men behandles separat.

Anbefaling:

```text
ENABLE_YOUTUBE = false
```

som default i første MVP.

Årsagen er ikke primært den tekniske integration med yt-dlp. Den kan håndteres af samme helper.

Årsagen er:

- YouTube ændrer løbende afspilnings-/attestationsmekanismer.
- adaptive streams er almindelige.
- en pure-browser implementation bliver unødigt kompleks.
- Chrome Web Store-politikken nævner eksplicit extensions, der faciliterer download af YouTube-videoer, som et eksempel på en forbudt type produkt.

Hvis projektet er til privat brug som unpacked extension, er Web Store-distribution ikke nødvendig.

## Out of scope

- DRM-bypass
- paywall-bypass
- login-bypass
- private content som brugeren ikke normalt har adgang til
- CAPTCHA-bypass
- geo-restriction bypass
- bulk scraping
- whole-channel download
- playlist download i MVP
- crawling efter videoer
- automatisk repost/upload
- platformkonto-automation

---

# 3. Brugeroplevelse

Målet er, at extensionen føles som en integreret browserfunktion.

## Flow A — inline button

På et X- eller Reddit-opslag:

```text
Reply   Repost   Like   Share   [↓]
```

Klik på `[↓]`.

Extensionen:

1. finder det omsluttende post-element
2. finder canonical post URL
3. sender den til background/service worker
4. vælger download-strategi
5. viser:
   - Downloading...
   - Done
   - eller en tydelig fejl

## Flow B — context menu

Højreklik på:

- video
- link
- side

Menu:

```text
Download video with MediaFetch
```

Context menu er en god fallback, fordi den er mindre afhængig af site-DOM end inline buttons.

## Flow C — toolbar

Klik på extension-ikonet:

```text
MediaFetch

Detected:
X post
@user
01:24

[Download best]
[720p]

Engine:
Native helper ready ✓
```

Hvis helper mangler:

```text
Native helper not installed

[Show setup instructions]
```

---

# 4. Chrome-arkitektur

```text
┌─────────────────────────────────────────────┐
│                 Web page                    │
│                                             │
│ X / Reddit / YouTube                        │
│                                             │
│  content script                             │
│  - detect post                              │
│  - inject optional button                   │
│  - extract canonical URL                    │
└──────────────────────┬──────────────────────┘
                       │ chrome.runtime message
                       v
┌─────────────────────────────────────────────┐
│       Manifest V3 service worker            │
│                                             │
│ - routing                                   │
│ - provider adapter selection                │
│ - settings                                  │
│ - download orchestration                    │
│ - Native Messaging connection               │
└──────────────┬─────────────────┬────────────┘
               │                 │
     direct URL│                 │complex source
               v                 v
┌────────────────────┐   ┌────────────────────┐
│ chrome.downloads   │   │ Native Messaging   │
│                    │   │ host               │
│ direct MP4/etc.    │   │                    │
└────────────────────┘   │ yt-dlp             │
                         │ ffmpeg             │
                         └─────────┬──────────┘
                                   │
                                   v
                              Downloads/
```

---

# 5. Manifest V3

Brug Manifest V3.

Minimal retning:

```json
{
  "manifest_version": 3,
  "name": "MediaFetch",
  "version": "0.1.0",
  "description": "Download media from supported pages.",
  "permissions": [
    "downloads",
    "contextMenus",
    "storage",
    "nativeMessaging"
  ],
  "host_permissions": [
    "https://x.com/*",
    "https://twitter.com/*",
    "https://www.reddit.com/*",
    "https://old.reddit.com/*",
    "https://v.redd.it/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup/popup.html"
  }
}
```

YouTube host permissions tilføjes kun hvis YouTube feature aktiveres.

Permissions skal holdes så smalle som muligt.

Undgå:

```text
<all_urls>
```

i MVP.

---

# 6. Service worker

Manifest V3 bruger en event-driven service worker.

Det betyder:

- antag ikke at globale variabler lever for evigt
- persistér state i `chrome.storage`
- jobs identificeres med UUID
- long-running native downloads håndteres via en `runtime.connectNative()` port
- UI skal kunne rekonstruere status efter popup genåbnes

State eksempel:

```json
{
  "jobs": {
    "4e...?": {
      "provider": "reddit",
      "url": "...",
      "state": "downloading",
      "progress": 0.61
    }
  }
}
```

Ryd afsluttede jobs efter kort tid.

---

# 7. Provider adapters

Extension-koden må ikke være én stor bunke site-specifik DOM-logik.

Brug interface:

```ts
interface ProviderAdapter {
  id: "x" | "reddit" | "youtube";

  matches(url: URL): boolean;

  getCanonicalUrl(context: PageContext): Promise<string | null>;

  detectMedia(context: PageContext): Promise<MediaCandidate[]>;

  injectInlineButton?(): void;
}
```

Folder:

```text
src/providers/
  x/
    adapter.ts
    selectors.ts
  reddit/
    adapter.ts
    selectors.ts
  youtube/
    adapter.ts
    selectors.ts
```

Site-specifikke selectors skal holdes isoleret.

---

# 8. DOM-observation

X og Reddit er dynamiske SPA'er.

En content script kan derfor ikke kun scanne siden én gang.

Brug:

```text
MutationObserver
```

men undgå at rescane hele DOM'en ved hver ændring.

Strategi:

1. observer subtree
2. saml nye candidate nodes
3. debounce
4. scan kun nye relevante områder
5. marker allerede behandlede posts med extension-owned state

Eksempel:

```html
<article data-mediafetch-scanned="1">
```

Helst brug `WeakSet<Element>` i runtime i stedet for at ændre siden mere end nødvendigt.

---

# 9. X-adapter

Primært mål:

```text
https://x.com/<user>/status/<id>
```

og ældre:

```text
https://twitter.com/<user>/status/<id>
```

## På detail page

Canonical URL er relativt nem at identificere.

## På timeline

Content script skal:

1. finde den video/knap brugeren interagerede med
2. finde nærmeste post/article container
3. finde `/status/<id>` link
4. konstruere canonical URL
5. sende URL'en til engine

Forsøg ikke i MVP at scrape brugerens hele timeline eller intercept alle GraphQL responses.

### Download

Direkte browser-download anvendes kun, hvis adapteren allerede har en valid komplet media URL.

Ellers:

```text
canonical X URL -> helper -> yt-dlp
```

Det er den robuste standardvej.

---

# 10. Reddit-adapter

Understøt:

```text
reddit.com/r/.../comments/<id>/...
old.reddit.com/...
redd.it/...
```

På en Reddit-feed skal extensionen kunne gå fra klik på media/post til den konkrete comments/permalink URL.

Reddit-video kan involvere adaptive streams eller separate audio/video tracks.

Derfor:

```text
direct media URL
    -> chrome.downloads hvis filen er komplet

post URL
    -> helper/yt-dlp hvis muxing/extraction er nødvendig
```

Extensionen skal ikke forsøge at implementere en generel DASH-muxer i MVP.

---

# 11. YouTube-adapter

YouTube må **ikke** drive arkitekturen.

Hvis aktiveret:

```text
youtube.com/watch?v=...
youtu.be/...
youtube.com/shorts/...
```

Extensionen identificerer kun canonical URL og metadata til UI.

Selve media extraction sendes direkte til native helper.

```text
YouTube URL
    |
    v
Native helper
    |
    v
yt-dlp + ffmpeg
```

Ingen forsøg på at genimplementere YouTube player deciphering, adaptive streaming, PO-token logic eller lignende i browser-extensionen.

## Distribution

Hvis YouTube download er en feature, bør projektet forventes distribueret privat/unpacked, ikke via Chrome Web Store.

Chrome Web Store-policyens troubleshooting-side angiver eksplicit "facilitating download of YouTube videos" som et eksempel på et prohibited product use case.

Det er en vigtig produktbeslutning:

```text
Private/unpacked extension:
    YouTube kan teknisk inkluderes.

Chrome Web Store mål:
    Fjern YouTube download-funktionen.
```

---

# 12. Native Messaging helper

Arbejdstitel:

```text
mediafetch_host
```

Chrome kommunikerer med helper via:

```text
chrome.runtime.connectNative("dk.kajsing.mediafetch")
```

Native host manifest:

```json
{
  "name": "dk.kajsing.mediafetch",
  "description": "MediaFetch native download helper",
  "path": "C:\\Program Files\\MediaFetch\\mediafetch-host.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID/"
  ]
}
```

På Windows registreres host manifest gennem:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\dk.kajsing.mediafetch
```

Brug HKCU for personlig installation, så admin rights ikke er nødvendige.

---

# 13. Stabil extension ID

Native Messaging kræver et præcist `allowed_origins` extension-ID.

Under udvikling skal extension-ID derfor være stabilt.

Muligheder:

1. fast development key i manifestet
2. installer/pack extension på en måde, der bevarer ID
3. installationsscript genererer native host manifest ud fra faktisk extension-ID

Den endelige løsning skal dokumenteres og automatiseres.

Ingen private signing secrets skal committes offentligt.

---

# 14. Native protocol

Kommunikér kun med små JSON-beskeder.

Chrome Native Messaging er ikke en filtransport.

Request:

```json
{
  "requestId": "uuid",
  "action": "download",
  "url": "https://x.com/foo/status/123",
  "options": {
    "maxHeight": 1080,
    "audioOnly": false
  }
}
```

Events:

```json
{
  "requestId": "uuid",
  "event": "started"
}
```

```json
{
  "requestId": "uuid",
  "event": "progress",
  "percent": 42.7,
  "speed": "8.4 MiB/s",
  "etaSeconds": 9
}
```

Result:

```json
{
  "requestId": "uuid",
  "event": "complete",
  "title": "Example",
  "path": "C:\\Users\\...\\Downloads\\Example.mp4",
  "sizeBytes": 12345678
}
```

Fejl:

```json
{
  "requestId": "uuid",
  "event": "error",
  "code": "CONTENT_UNAVAILABLE",
  "message": "The video could not be downloaded."
}
```

Returnér aldrig media bytes via Native Messaging.

---

# 15. Helper implementation

Anbefaling:

```text
Python 3.12+
yt-dlp
ffmpeg
```

MVP helper kan være Python under udvikling.

Senere kan den pakkes som:

```text
mediafetch-host.exe
```

via fx PyInstaller.

Helper responsibilities:

- validér request
- validér provider
- reject ukendte domains
- kør yt-dlp
- parse progress
- anvend ffmpeg ved behov
- generér sikkert filnavn
- gem i configured folder
- returnér status

Extensionen må ikke kunne sende vilkårlige yt-dlp arguments.

---

# 16. yt-dlp execution

Anbefalet:

- brug subprocess
- argv array
- `shell=False`
- timeout
- capture stdout/stderr
- structured progress template hvor muligt
- max én/få concurrent jobs

Eksempel konceptuelt:

```python
args = [
    yt_dlp_path,
    "--no-playlist",
    "--newline",
    "--restrict-filenames",
    "-f",
    "bv*[height<=1080]+ba/b[height<=1080]/b",
    "--merge-output-format",
    "mp4",
    "-o",
    output_template,
    url,
]
```

Den præcise format selector skal testes mod aktuelle yt-dlp-versioner.

Undgå at låse designet til ét bestemt yt-dlp stdout-format uden tests.

---

# 17. Download-folder

Default:

```text
Windows Downloads folder
```

Men gør den konfigurerbar via extension Options.

Gem indstillingen i:

```text
chrome.storage.local
```

Extension -> helper request kan sende et logisk target-id:

```json
{
  "destination": "default"
}
```

Undgå at lade content scripts sende arbitrary filesystem paths.

Helperen ejer path policy.

---

# 18. Filnavne

Forslag:

```text
<provider>_<author>_<post-id>_<title>.<ext>
```

men sanitér aggressivt.

Krav:

- ingen `..`
- ingen path separators
- ingen reserved Windows filenames
- begrænset længde
- Unicode tilladt hvis robust
- collision strategy:

```text
filename.ext
filename (1).ext
```

eller yt-dlp's egen collision handling.

---

# 19. Permissions

MVP:

```text
downloads
contextMenus
storage
nativeMessaging
```

Host permissions:

```text
x.com
twitter.com
reddit.com
old.reddit.com
v.redd.it
```

YouTube kun hvis feature aktiveres.

Overvej `activeTab` i stedet for brede host permissions, hvis UX kan fungere tilfredsstillende med det.

Inline injection på alle X/Reddit pages taler dog for specifikke host permissions.

Undgå:

```text
debugger
cookies
<all_urls>
```

medmindre et dokumenteret behov senere opstår.

`debugger` er særligt magtfuldt og bør ikke bruges som genvej til network sniffing.

---

# 20. Network interception

Manifest V3 har fortsat `webRequest` til observation, men blocking-mode er begrænset for almindelige extensions.

Projektet bør **ikke** baseres på at sniffe alle browserrequests.

Primær extraction:

```text
DOM -> canonical post URL -> helper
```

ikke:

```text
intercept every network response -> guess media URLs
```

Det gør løsningen mindre skrøbelig og kræver færre permissions.

---

# 21. Direct-download fast path

En direct URL kan hentes med:

```js
chrome.downloads.download({
  url,
  filename,
  saveAs: false
})
```

Brug kun fast path når:

- scheme er HTTPS
- host er forventet CDN/provider
- URL kommer fra trusted adapter
- media vurderes komplet
- ingen separat audio er nødvendig

Hvis der er tvivl:

```text
fallback -> native helper
```

---

# 22. Inline UI design

Inline button skal være diskret.

Forslag:

```text
↓
```

med tooltip:

```text
Download media
```

Ved klik:

```text
↓     idle
◌     resolving
42%   downloading
✓     complete
!     error
```

Undgå at kopiere X/Reddit-branding.

Extension button skal visuelt være sit eget element.

---

# 23. Shadow DOM / CSS isolation

For at undgå CSS-konflikter:

- brug en lille Shadow DOM root til MediaFetch inline UI, eller
- brug konsekvent namespaced CSS:

```text
mf-
mediafetch-
```

Eksempel:

```text
mediafetch-download-button
```

Injection må ikke ændre layout mere end nødvendigt.

---

# 24. SPA navigation

X, Reddit og YouTube navigerer ofte uden fuld page reload.

Content script skal kunne registrere:

- URL change
- DOM replacement
- nye feed posts

Undgå assumptions om `DOMContentLoaded` som eneste init-event.

Adapter skal være idempotent.

---

# 25. Security model

Dette er vigtigt, fordi content scripts arbejder i sider, vi ikke kontrollerer.

## Content script er untrusted input boundary

Alt der kommer fra content script skal valideres igen i service worker.

Native helper skal derefter validere URL **igen**.

Tre lag:

```text
Page
  -> content validation
Service worker
  -> provider/URL validation
Native helper
  -> final allowlist validation
```

Native helper må kun hente:

```text
supported provider URLs
```

Ikke vilkårlige URLs fra siden.

---

# 26. Allowed domains

Extension/provider:

```text
X:
  x.com
  www.x.com
  twitter.com
  www.twitter.com

Reddit:
  reddit.com
  www.reddit.com
  old.reddit.com
  redd.it

YouTube optional:
  youtube.com
  www.youtube.com
  m.youtube.com
  youtu.be
```

Helperen bør primært modtage canonical **page URLs**, ikke raw CDN URLs.

Det holder trust boundary simpel.

---

# 27. Auth

MVP:

```text
ingen eksplicit cookie extraction
ingen password handling
ingen token handling
```

yt-dlp kan senere få optional støtte til brugerens eksisterende browser-session, men det er en separat feature og skal designes med credential-sikkerhed i fokus.

Start uden den.

---

# 28. Error model

Stabile fejlkoder:

```text
NO_MEDIA
UNSUPPORTED_PAGE
UNSUPPORTED_PROVIDER
HELPER_NOT_INSTALLED
HELPER_VERSION_MISMATCH
YTDLP_NOT_FOUND
FFMPEG_NOT_FOUND
AUTH_REQUIRED
CONTENT_UNAVAILABLE
RATE_LIMITED
DOWNLOAD_FAILED
MERGE_FAILED
PERMISSION_DENIED
DISK_FULL
TIMEOUT
CANCELLED
```

UI viser human-readable text.

Debug logging må gerne vise teknisk årsag, men ikke credentials eller signed media URLs.

---

# 29. Helper handshake

Når extensionen starter eller popup åbnes:

```json
{
  "action": "hello",
  "protocolVersion": 1
}
```

Svar:

```json
{
  "ok": true,
  "protocolVersion": 1,
  "helperVersion": "0.1.0",
  "ytDlpVersion": "...",
  "ffmpeg": true,
  "providers": {
    "x": true,
    "reddit": true,
    "youtube": true
  }
}
```

Det gør fejl meget nemmere at diagnosticere.

---

# 30. Options page

Indstillinger:

```text
Download folder
Default quality:
  Best <=1080p
  1080p
  720p

Inject inline button:
  X       [on]
  Reddit  [on]
  YouTube [off]

Show completion notification [on]

Use native helper automatically [on]
```

Ingen avanceret yt-dlp command box.

Det ville reelt være arbitrary command configuration og gør support/sikkerhed dårligere.

---

# 31. Cancel download

MCP var ikke nødvendigt, men Native Messaging porten giver os en fin bidirectional channel.

Request:

```json
{
  "action": "cancel",
  "requestId": "uuid"
}
```

Helper holder process handle per job og terminerer yt-dlp/ffmpeg process tree.

UI:

```text
[Cancel]
```

---

# 32. Concurrency

Default:

```text
MAX_CONCURRENT_DOWNLOADS = 2
```

Yderligere jobs står i kø.

Ingen grund til at lade 15 klik starte 15 ffmpeg/yt-dlp-processer.

---

# 33. Logging

Extension debug:

```text
provider
post URL / content id
adapter result
helper status
error code
```

Helper:

```text
timestamp
requestId
provider
content ID
duration
result
yt-dlp version
```

Undgå:

- cookies
- auth headers
- signed CDN URLs
- komplette browserdata
- unødvendig browsing history

---

# 34. Chrome Web Store vs. private extension

Projektet bør tidligt vælge distribution model.

## Private/personal

Brug:

```text
chrome://extensions
Developer mode
Load unpacked
```

Det er velegnet under udvikling og til personlig brug.

Native helper installeres via `install.ps1`.

## Chrome Web Store

Hvis målet senere bliver public distribution:

- gennemgå Web Store policies igen
- YouTube downloader-funktion bør ikke indgå
- permissions skal minimeres
- privacy disclosure bliver relevant
- native helper gør onboarding mere kompleks

MVP bør optimeres til **private/unpacked use**.

---

# 35. Installer

Repository:

```text
installer/
  install.ps1
  uninstall.ps1
  native-host.template.json
```

`install.ps1`:

1. verificér Windows
2. opret `%LOCALAPPDATA%\MediaFetch`
3. installer/copy helper
4. verificér yt-dlp
5. verificér ffmpeg
6. skriv native messaging manifest
7. opret HKCU registry key
8. test helper handshake
9. vis næste trin for Load unpacked

Senere kan helperen pakkes med dependencies.

---

# 36. Repository layout

```text
mediafetch/
├─ extension/
│  ├─ manifest.json
│  ├─ src/
│  │  ├─ background/
│  │  │  ├─ service-worker.ts
│  │  │  ├─ jobs.ts
│  │  │  └─ native-host.ts
│  │  ├─ content/
│  │  │  ├─ index.ts
│  │  │  └─ ui.ts
│  │  ├─ providers/
│  │  │  ├─ x/
│  │  │  ├─ reddit/
│  │  │  └─ youtube/
│  │  ├─ popup/
│  │  ├─ options/
│  │  └─ shared/
│  └─ tests/
│
├─ native-host/
│  ├─ pyproject.toml
│  ├─ src/
│  │  └─ mediafetch_host/
│  │     ├─ main.py
│  │     ├─ protocol.py
│  │     ├─ downloader.py
│  │     ├─ providers.py
│  │     └─ security.py
│  └─ tests/
│
├─ installer/
│  ├─ install.ps1
│  └─ uninstall.ps1
│
├─ docs/
└─ README.md
```

TypeScript anbefales til extensionen.

Python anbefales til helperen.

---

# 37. Testing

## Extension unit tests

- provider URL parsing
- canonical URL extraction fra fixture HTML
- unknown host rejected
- message schema validation
- job state reducer
- feature flags

## DOM fixture tests

Gem små sanitiserede HTML fixtures for:

- X post
- X timeline
- Reddit post
- Reddit feed

Når platform markup ændrer sig, kan adapter-tests opdateres isoleret.

## Helper unit tests

- URL allowlist
- command construction
- no arbitrary args
- filename sanitization
- native message framing
- protocol validation
- error mapping

## Integration tests

Mock yt-dlp.

Verificér:

```text
extension message
  -> native protocol
  -> helper
  -> progress
  -> complete
```

## Live smoke tests

Manuel/opt-in:

```text
X public video
Reddit public video
YouTube test video if enabled
```

Live tests må ikke være en normal blocking CI-test.

---

# 38. Manual test matrix

| Scenario | Expected |
|---|---|
| X detail post med video | download |
| X timeline post med video | correct post download |
| X post uden video | NO_MEDIA |
| Reddit video post | download |
| Reddit image post | NO_MEDIA / future image support |
| Reddit video + separate audio | helper merges |
| unsupported site | no action |
| helper missing | setup message |
| ffmpeg missing | explicit error |
| two simultaneous downloads | both work |
| third download | queue |
| cancelled download | process killed |
| malformed page data | fail closed |
| YouTube disabled | feature hidden |
| YouTube enabled | helper path |

---

# 39. MVP acceptance criteria

MVP er færdig når:

1. Extensionen kan loades unpacked i Chrome.
2. Extension-ID er stabilt nok til Native Messaging development.
3. Native helper handshake virker.
4. X detail-page video kan downloades.
5. X timeline download knyttes til korrekt post.
6. Reddit video kan downloades.
7. Reddit med separate audio/video streams bliver muxet korrekt.
8. Context-menu fallback virker.
9. Popup viser provider og helper status.
10. Helper missing giver forståelig setup-fejl.
11. Ukendte hosts afvises.
12. Page/content script kan ikke få helperen til at hente vilkårlige URLs.
13. Cancel virker.
14. Max 2 samtidige downloads.
15. Extension/service-worker reload mister ikke permanent settings.
16. Ingen credentials logges.
17. YouTube er isoleret bag feature flag.
18. README indeholder installation og troubleshooting.

---

# 40. Implementeringsplan til Codex

## Phase 1 — Skeleton

Byg:

- MV3 extension
- TypeScript build
- popup
- service worker
- context menu
- options storage

Test unpacked.

## Phase 2 — Native host

Byg:

- Python Native Messaging host
- hello/version handshake
- install.ps1
- stable development extension ID
- host allow_origin

Ingen yt-dlp endnu.

## Phase 3 — Downloader

Tilføj:

- yt-dlp
- ffmpeg detection
- progress messages
- cancel
- output folder
- safe filenames

## Phase 4 — Reddit

Byg Reddit adapter.

Start med page/action + context menu.

Tilføj inline button bagefter.

## Phase 5 — X

Byg X adapter.

Test både detail page og infinite timeline.

## Phase 6 — Hardening

- schemas
- URL validation
- logging
- queue
- concurrency
- error mapping
- tests

## Phase 7 — YouTube optional

Feature flag.

Kun canonical URL extraction i extension.

Alt downloadarbejde går til helper.

Ingen YouTube reverse engineering i extension-koden.

---

# 41. Ting Codex eksplicit IKKE skal gøre

Codex må ikke:

- bygge en generic arbitrary URL downloader
- bruge `<all_urls>` uden begrundelse
- bruge `chrome.debugger` for at sniffe trafik som standard
- håndtere passwords
- omgå DRM
- omgå login/paywalls
- implementere CAPTCHA bypass
- bygge playlist/channel scraping i MVP
- acceptere raw shell arguments fra extension
- køre subprocess via shell
- implementere sin egen YouTube decipher/extractor
- hente remote JavaScript og execute det i extensionen
- gemme cookie/token data i logs
- sende media bytes gennem Native Messaging

---

# 42. Beslutningsmatrix

| Arkitektur | X | Reddit | YouTube | Kompleksitet | Robusthed |
|---|---:|---:|---:|---:|---:|
| Pure Chrome direct URLs | God/variabel | Variabel | Dårlig | Lav først, høj senere | Lav-mellem |
| Pure Chrome + JS HLS/DASH muxing | Mulig | Mulig | Svær | Høj | Lav-mellem |
| Chrome + remote backend | God | God | God | Mellem | Høj |
| Chrome + local yt-dlp helper | God | God | God | Mellem | Høj |

**Valg:** Chrome + local yt-dlp helper, med direct-download fast path.

Det er den løsning, der giver mest funktionalitet pr. linje egen platformkode.

---

# 43. Vigtig YouTube-konklusion

YouTube er **ikke teknisk en platform for langt**, hvis en lokal yt-dlp helper accepteres.

YouTube er derimod en dårlig kandidat til:

```text
pure Chrome extension + Chrome Web Store distribution
```

Så vi bør holde tre ting adskilt:

```text
Browser UX        = Chrome extension
Extraction engine = yt-dlp helper
Distribution      = private/unpacked
```

Det giver os mulighed for at bygge den brugeroplevelse, vi faktisk vil have, uden at presse alle problemer ind i browserens sandbox.

---

# 44. Sources verified during pre-study

Chrome Extensions — Manifest V3:
https://developer.chrome.com/docs/extensions/reference/manifest

Chrome Downloads API:
https://developer.chrome.com/docs/extensions/reference/api/downloads

Chrome Native Messaging:
https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

Chrome webRequest:
https://developer.chrome.com/docs/extensions/reference/api/webRequest

Chrome contextMenus:
https://developer.chrome.com/docs/extensions/reference/api/contextMenus

Chrome Storage API:
https://developer.chrome.com/docs/extensions/reference/api/storage

Chrome local/unpacked extension tutorial:
https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world

Chrome Web Store troubleshooting / prohibited products:
https://developer.chrome.com/docs/webstore/troubleshooting

yt-dlp:
https://github.com/yt-dlp/yt-dlp

YouTube Terms:
https://www.youtube.com/t/terms

X automation rules:
https://help.x.com/en/rules-and-policies/x-automation

Reddit Developer Platform:
https://developers.reddit.com/
