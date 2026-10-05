# Bikepacking – Begleit-App für lange Touren und Ultracycling-Rennen

Dauerhafte Projektgrundlage. Vor jeder Änderung lesen; bei Änderungen an Architektur,
Regeln oder Etappen-Status hier nachführen.

## Kontext

Simon (Ultracycler aus der Schweiz) nutzt die App für **lange Bikepacking-Touren und
Ultracycling-Rennen** (mehrere Tage bis Wochen, unsupported). Sie ist darum allgemein
gehalten: Tour bzw. Rennen, Start, Kontrollpunkte (Gates/Checkpoints) mit optionalen
Zeitfenstern, Fähren, Ziel – alles konfigurierbar, nichts fest auf ein Rennen verdrahtet.
App-Name: `APP_NAME` in `js/config.js` ("Bikepacking").

**Erstes grosses Ziel:** das **NorthCape 4000** am **24. Juli 2027**, Start in
**Rovereto**, Pflicht-Gates **München, Berlin, Gränna, Rovaniemi**, Ziel **Nordkapp**.
Mindest- und Maximalzeiten bzw. Zeitfenster pro Gate sind für 2027 noch nicht publiziert
(→ konfigurierbar). Das offizielle Tracking (WHIP) läuft als App auf Simons iPhone,
Garmin LiveTrack auf seinem Garmin.

Die App ist eine **PWA**, die Simon als Home-Screen-App auf dem iPhone nutzt:
Statuswechsel (fahren, Pause, Hotel, schlafe, wach, losgefahren), Befindens-Regler, Karte
mit Versorgungspunkten, Zeitplan mit Kontrollpunkten und Fähren, Statistiken. Follower
verfolgen alles live über eine separate Seite mit geheimem Link.

## Architektur

- PWA auf GitHub Pages: https://simongraf-ultracycling.github.io/northcape4000/
  Veröffentlichung über den eigenen Ablauf `.github/workflows/pages.yml` (Pages-Source
  "GitHub Actions"): bei jedem Push auf `main` erst `node tools/check.mjs`, dann nur die
  App-Dateien (index.html, manifest, sw.js, css/, js/, icons/) veröffentlichen.
- Reines HTML/CSS/JavaScript mit ES-Modulen. **Kein Build-Tool, kein npm, kein Framework.**
- Firebase (Firestore + Authentication E-Mail/Passwort) über das offizielle modulare
  Firebase JS SDK vom CDN (gstatic), **Version fest gepinnt** in `js/version.js`.
- Firestore-Standort: europe-west6, Datenbank: `(default)`.
- Später: Google Apps Script als "Postbote" (Garmin-LiveTrack-Mail auslesen, LiveTrack
  abfragen), Scriptable-Skripte (Kurzbefehle, Widgets, Offline-Erinnerungen), Follower-Seite.

### Projektstruktur

```
index.html              App-Hülle (Kopfzeile, Tab-Leiste, CSP)
manifest.webmanifest    PWA-Manifest
sw.js                   Service Worker (Precache, Offline, Updates) – APP_FILES pflegen!
firestore.rules         Sicherheitsregeln (in der Firebase-Konsole veröffentlichen)
css/tokens.css          ALLE Design-Variablen: 5 Farbmodi, 10 Designs, Renn-Modus
css/app.css             Layout und Komponenten, nur mit Variablen
icons/                  App-Icons (erzeugt mit tools/make_icons.py)
js/boot.js              Frühstart: Darstellung, frühe Fehler, Notfall-Anzeige
js/app.js               Einstieg: Start, Login oder App
js/version.js           VERSION und FIREBASE_SDK_VERSION – einzige Stelle
js/config.js            APP_NAME, Firebase-Konfiguration, OWNER_UID, RACE_ID
js/clock.js             Einzige Zeitquelle (clock.now / clock.realNow), Simulation
js/log.js               Fehlerprotokoll (letzte 200 Einträge, lokal)
js/local.js             Geräte-Speicher (localStorage), nur für Infrastruktur
js/format.js            de-CH-Formatierung (24 h, metrisch)
js/store.js             Datenschicht – EINZIGE Schnittstelle für Daten
js/store/firebase-backend.js   Firestore + Auth (nur von store.js benutzt)
js/store/sim-backend.js        Lokaler Simulator (gleiche Schnittstelle)
js/store/sim-seed.js           Testdaten für den Sim-Modus
js/update.js            Service-Worker-Registrierung, Update-Erkennung, Cache leeren
js/ui/display.js        Farbmodus, Design, Renn-Modus (setzt data-Attribute)
js/ui/…                 Oberfläche: dom-Helfer, Symbole, Hülle, Router, Ansichten
tools/check.mjs         Regel-Prüfung: node tools/check.mjs (nur Node-Bordmittel)
.github/workflows/pages.yml   Prüfen + Veröffentlichen auf GitHub Pages (bei Push auf main)
tools/make_icons.py     Icons einmalig erzeugen (nur Python-Standardbibliothek)
```

### Datenschicht (`js/store.js`)

- Backends austauschbar: `firebase` (Standard) und `sim` (Sim-Modus, lokal, Testdaten,
  kein Login). Gewählt beim Start anhand des Sim-Schalters.
- Firestore mit `persistentLocalCache` (IndexedDB, Mehr-Tab-Manager, unbegrenzte
  Cache-Grösse): Schreibvorgänge werden offline gespeichert und automatisch nachgeliefert,
  auch nach App-Neustart. Gelesene Dokumente (auch privat) bleiben offline verfügbar.
- Datenstruktur `races/{raceId}/…`:
  - `races/{raceId}` – Dokument der Tour bzw. des Rennens (öffentlich per get)
  - `events/{id}` – Ereignisse (`addEvent(type, data)`, `subscribeEvents`)
  - `config/{key}` – Tour-Konfiguration, Wert im Feld `value` (`getConfig`, `setConfig`, `subscribeConfig`)
  - `debug/{id}` – Test-Einträge aus dem Debug-Bereich
  - `private/{key}` – **nur Besitzer**: offizielle Route (GPX-Daten), eigene POIs (`getPrivate`, `setPrivate`)
- Jeder Eintrag: `clientTime` (ms, aus `clock.now()`, **massgeblich für Auswertungen**),
  `tzOffset` (Minuten), `appVersion`, `serverTime` (serverTimestamp, nur Info; `null`
  solange nicht synchronisiert).
- Schreiben gibt sofort `{ id, local, server }` zurück. `local` = lokal gespeichert,
  `server` = vom Server bestätigt (bleibt offline offen). **Oberfläche wartet nie auf `server`.**
- Geräte-Einstellungen (Renn-Modus, Sim-Schalter …) über `store.settings`.
- Abonnements liefern Objekte `{ id, …Felder, pending }`; `pending` = noch nicht beim Server.

### Offline und Updates

- `sw.js` cacht alle App-Dateien (Liste `APP_FILES`) und die Firebase-SDK-Dateien vorab
  (Cache `nc4000-<VERSION>`). Die App startet komplett offline.
- Die Seite registriert `sw.js?v=<VERSION>&fb=<SDK-Version>`; so ist `js/version.js` die
  einzige Stelle der Versionsnummer.
- Update-Erkennung: `js/update.js` liest `js/version.js` direkt vom Server (Start, Rückkehr
  in die App, alle 30 min, Knopf im Debug). Neuere Version → neuer Service Worker lädt im
  Hintergrund → Banner "Neue Version – tippen zum Laden" → erst beim Tippen
  `skipWaiting` + Neuladen.
- Die Installation lädt erst in einen Zwischen-Cache und prüft die Versionsnummer; bei
  Fehlern bleibt der laufende Cache unangetastet.

### Sim-Modus und Zeit

- `clock.now()` ist die App-Zeit. Im Sim-Modus kann sie gesetzt werden (inkl.
  Zeitraffer-Faktor). `clock.realNow()` nur für Technisches (Protokoll, Latenzen).
- Sim-Modus = Sim-Backend + simulierte Zeit; oben orange Leiste. Umschalten startet die App neu.
- "Offline simulieren" (beide Modi; Firebase: `disableNetwork`) wird bewusst nicht
  gespeichert – nach Neustart ist die App wieder online.

## Etappen-Plan

| # | Etappe | Status |
|---|--------|--------|
| 1 | Grundgerüst: App-Hülle, Liquid-Glass-Design, Offline/Updates, Datenschicht, Login, Regeln, Sim-Modus, Debug | ✅ erledigt (v0.1.0; v0.4.0: allgemein für Bikepacking; v0.5.0: fünf neutrale Farbmodi × zehn Designs) |
| 2 | Status-Automat und Befindens-Regler mit Firebase-Sync | offen |
| 3 | Karte: Testroute, Import der offiziellen GPX (nur privat!), Echtzeit-Standort, Versorgungspunkte, eigene POIs, Google-Maps-Knopf | offen |
| 4 | Zeitplan: Kontrollpunkte/Gates, Zeitfenster, Etappen, Fähren-Rechner | offen |
| 5 | Statistik: Tageswerte, Diagramme | offen |
| 6 | Follower-Seite mit geheimem Link | offen |
| 7 | Postbote (Apps Script): Garmin-Mail und LiveTrack | offen |
| 8 | Scriptable: Kurzbefehle, Siri, Widgets, lokale Erinnerungen | offen |
| 9 | Extra: WHIP-Fahrerfeld | offen |

## Design-Grundsätze

- **Schlicht, neutral, rund.** Knöpfe, Eingabefelder, Tabs, Toasts und die
  Kopfzeilen-Bedienelemente sind Pillen. Ruhige Flächen ohne Farbverläufe.
- **Keine Unschärfe, keine Verläufe am Rand** (Simon mag das ausdrücklich nicht – "die
  Schrift verläuft"). Kopf- und Fussbereich (`.top-cover`, `.bottom-cover`) sind deckend
  in der Hintergrundfarbe; beim Scrollen erscheint unter dem Titel eine feine Linie
  (`:root.scrolled`, gesetzt in `js/ui/shell.js`). Der Titel steht als Text oben, Zurück
  und Verbindungsanzeige sind kleine Pillen (`.chip`, `.chip-round`, 44 px sichtbar,
  56 px Tippfläche).
- **Unten:** Tab-Leiste als schwebende Pille, **konzentrisch zu den Bildschirmecken**
  (gefällt Simon sehr): `js/boot.js` setzt `--screen-radius` je iPhone-Modell (nach
  Bildschirmgrösse), Abstand zu Rand und Boden `--tabbar-inset` = Eckradius − halbe
  Leistenhöhe (mind. 10 px).
- **Zwei unabhängige Einstellungen** (Mehr → Darstellung):
  - **Farbmodus** `data-mode` (neutral, flach): `weiss`, `hellgrau` (hell), `dunkelgrau`,
    `dunkelblau` (Standard), `schwarz` (dunkel); daraus folgt `data-scheme="light|dark"`.
    Dazu "Automatisch": folgt `prefers-color-scheme` (Weiss bzw. Dunkelblau).
  - **Design** `data-theme`: ruhige Varianten derselben Form – Schrift, Knopf-Stil,
    Symbol-Strich und -Plättchen, Karten, Tab-Markierung, Akzentfarbe. **Nicht nur
    Farbe ändern.** Standard: Klar.
    | Design | Charakter |
    |---|---|
    | `klar` | wie iOS: SF Pro, gefüllte Knöpfe, schlichte Symbole, Akzent Blau |
    | `rund` | SF Rounded, Symbole in getönten Kreisen, getönte Knöpfe, Tab gefüllt |
    | `fein` | leichte Schrift, Strich 1,5, umrandete Karten/Knöpfe/Tab-Leiste |
    | `kraeftig` (Kräftig) | fette Schrift, Strich 2,6, Symbole auf farbigen Plättchen |
    | `klassik` | Serifen-Titel (New York), kursive Abschnitte, dunkle (invertierte) Knöpfe |
    | `technik` | SF Mono für Titel/Werte, eckige Linienenden, umrandete Plättchen, Grün |
    | `avenir` | Avenir Next, Symbole in Ringen, getönte Zweitknöpfe |
    | `helvetica` | Helvetica Neue, schwarz-weiss, eckige Linienenden |
    | `glas` | durchscheinende Flächen mit Glanz, Lichtkante und Schatten |
    | `geometrisch` | Futura-Titel, Symbole in Farbkreisen, Akzent Himbeere |
- Umsetzung in `css/tokens.css`: Grundwerte, Schema hell/dunkel (Statusfarben,
  Schatten, Wahl des Akzents), Farbmodi (`--bg-base`, `--surface`, `--surface-2`,
  `--surface-bar`, Text, Trennlinien, Felder), Design-Grundwerte `[data-theme]` und je
  Design ein Block mit Form-Variablen (`--font-*`, `--section-*`, `--radius-card`,
  `--card-*`, `--icon-stroke/-cap/-join`, `--badge-*`, `--btn-*`, `--bar-*`, `--tab-*`)
  und Akzent `--accent-l/-d`, `--on-accent-l/-d` (hell/dunkel).
  Nur iOS-Systemschriften verwenden (offline, keine Downloads).
- Neues Design bzw. neuer Farbmodus: Block in `tokens.css`, Eintrag in `THEMES` bzw.
  `MODES` (`js/ui/display.js`) und in den Listen in `js/boot.js` – `tools/check.mjs`
  prüft das. Jede Kombination muss lesbar bleiben (Kontrast, Tippflächen ≥ 56 px) und
  im Renn-Modus funktionieren.
- Helle Farbmodi: Hinter der iOS-Statusleiste (weisse Schrift wegen
  `black-translucent`) liegt eine leichte Abdunklung (`--statusbar-scrim`); auf dem
  iPhone kontrollieren.
- **Lesbarkeit hat Vorrang:** Text und Bedienelemente immer kontraststark.
- **Renn-Modus (Glas reduzieren)** unter Mehr → Darstellung: behält Farbmodus, Schrift,
  Formen und Akzent, macht aber alle Flächen deckend, Ränder deutlich, entfernt Glanz
  und Schatten und setzt die Schrift auf maximalen Kontrast (Sonnenlicht). Automatisch
  aktiv bei `prefers-reduced-transparency` bzw. `prefers-contrast: more`.
- Alle Farben, Radien, Schatten, Schriften als CSS-Variablen in `css/tokens.css`.
- Touch: Tippflächen **mind. 56 px**, mit Handschuhen bedienbar, `touch-action: manipulation`,
  Eingabefelder **mind. 16 px** (kein Auto-Zoom). Ganze Zeilen tippbar (Schalter).
- iOS-Home-Screen: `viewport-fit=cover`, Safe-Area-Abstände, Statusleiste black-translucent.

## Feste Regeln

- **Das Repository ist öffentlich.** Niemals GPX-Dateien der offiziellen Route, Passwörter,
  Tokens oder persönliche Daten ins Repository. Die offizielle NC4000-Route darf nicht
  weiterverbreitet werden; sie existiert nur im privaten Firebase-Bereich
  (`races/{raceId}/private/**`). Eine selbst erstellte Testroute über die Gate-Orte ist erlaubt.
  Das gilt sinngemäss für jede offizielle Rennroute.
- **Niemals** Google Analytics oder andere Tracking-/Analyse-Bausteine einbinden.
- Alle Datenzugriffe nur über `js/store.js`. Alle Zeitabfragen nur über `clock.now()`.
- Auswertungen immer auf `clientTime` basieren.
- **Offline-first:** Jede Funktion muss ohne Netz bedienbar sein oder klar anzeigen, dass
  sie Netz braucht.
- **Versionsnummer bei jeder Änderung erhöhen** (`js/version.js`), `CHANGELOG.md` nachführen.
- Oberfläche auf Deutsch (Schweizer Schreibweise, "ss" statt "ß"), 24-Stunden-Format,
  metrische Einheiten.
- Keine externen Abhängigkeiten ausser Firebase-SDK; spätere Bibliotheken (z.B. Karte,
  Diagramme) per CDN mit fester Version und im Service Worker gecacht.
- Design-Änderungen nur über die zentralen CSS-Variablen; Renn-Modus muss immer funktionieren
  (in jedem Design, dunkel und hell).

### Praktische Ergänzungen

- **Arbeitsweise (Wunsch von Simon):** Fertige Änderungen immer direkt als Pull Request
  auf `main` bringen und sofort mergen – nicht nachfragen. GitHub Pages veröffentlicht
  danach automatisch; die App zeigt das Update-Banner.
- Ausnahmen der Datenregel: `js/clock.js` und `js/log.js` nutzen den Geräte-Speicher
  (`js/local.js`) direkt (vermeidet Import-Zyklen); `js/boot.js` liest dieselben Schlüssel.
- Neue App-Dateien in `APP_FILES` von `sw.js` eintragen; neue externe Quellen (CDN,
  Karten-Kacheln) in die Content-Security-Policy in `index.html` aufnehmen und – bei
  Bibliotheken – im Service Worker vorab cachen.
- Inhalte nie per `innerHTML` mit Daten einsetzen; `h()` aus `js/ui/dom.js` verwenden.
- Vor jedem Commit: `node tools/check.mjs` (Precache-Liste, Syntax, Zeit-/Firebase-Regeln,
  Tracking, ß, GPX, CHANGELOG-Eintrag).
- Sicherheitsregeln ändern = `firestore.rules` anpassen und in der Konsole veröffentlichen
  (README.md); danach in der App Mehr → Debug → "Follower-Sicht prüfen".

## Hinweise für spätere Etappen

- Firestore-Dokumente sind auf **1 MB** begrenzt → Route vereinfachen und/oder in
  Abschnitte aufteilen (z.B. `private/route-001`, `private/route-002`, …).
- Firestore erlaubt **keine verschachtelten Arrays** → Koordinaten als flaches Array
  `[lat, lon, lat, lon, …]` oder als kodierter Polyline-String speichern.
- Private Inhalte nach dem Laden offline verfügbar halten: einmal per `getPrivate` laden;
  der Firestore-Cache ist unbegrenzt (keine automatische Bereinigung).
- Tageswerte/Statistik über `clientTime` + `tzOffset` (Simon wechselt Zeitzonen: MESZ,
  in Finnland OESZ).
- Header zeigt Verbindung und Anzahl nicht synchronisierter Einträge (Tippen → Debug).
- Sim-Testdaten in `js/store/sim-seed.js` pro Etappe ergänzen.

## Offene Punkte

- **raceId ist nicht geheim:** `RACE_ID` steht in `js/config.js` im öffentlichen
  Repository und auf der öffentlichen Website. Wer sie kennt, kann alle nicht-privaten
  Daten lesen. Vor Etappe 6 (Follower-Seite) entscheiden, z.B.: echte Renn-raceId nicht im
  Repository, sondern nur auf Simons Gerät bzw. in einem nur für den Besitzer lesbaren
  Dokument hinterlegen; die ID in `config.js` bleibt dann eine Test-ID.
- Zeitfenster der Gates 2027 noch nicht publiziert (konfigurierbar in Etappe 4).
- Startzeit (Uhrzeit) am 24.07.2027 noch offen.
