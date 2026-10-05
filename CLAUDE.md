# NorthCape 4000 – Renn-App

Dauerhafte Projektgrundlage. Vor jeder Änderung lesen; bei Änderungen an Architektur,
Regeln oder Etappen-Status hier nachführen.

## Kontext

Simon (Ultracycler aus der Schweiz) fährt am **24. Juli 2027** das **NorthCape 4000**,
unsupported, Start in **Rovereto**. Pflicht-Gates: **München, Berlin, Gränna, Rovaniemi**,
Ziel **Nordkapp**. Es gibt Mindest- und Maximalzeiten bzw. Zeitfenster pro Gate (für 2027
noch nicht publiziert → müssen konfigurierbar sein). Das offizielle Tracking (WHIP) läuft
als App auf Simons iPhone, Garmin LiveTrack auf seinem Garmin.

Die App ist eine **PWA**, die Simon als Home-Screen-App auf dem iPhone nutzt:
Statuswechsel (fahren, Pause, Hotel, schlafe, wach, losgefahren), Befindens-Regler, Karte
mit Versorgungspunkten, Zeitplan mit Gates und Fähren, Statistiken. Follower verfolgen
alles live über eine separate Seite mit geheimem Link.

## Architektur

- PWA auf GitHub Pages: https://simongraf-ultracycling.github.io/northcape4000/
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
css/tokens.css          ALLE Design-Variablen (Farben, Radien, Unschärfe, Renn-Modus)
css/app.css             Layout und Komponenten, nur mit Variablen
icons/                  App-Icons (erzeugt mit tools/make_icons.py)
js/boot.js              Frühstart: Darstellung, frühe Fehler, Notfall-Anzeige
js/app.js               Einstieg: Start, Login oder App
js/version.js           VERSION und FIREBASE_SDK_VERSION – einzige Stelle
js/config.js            Firebase-Konfiguration, OWNER_UID, RACE_ID
js/clock.js             Einzige Zeitquelle (clock.now / clock.realNow), Simulation
js/log.js               Fehlerprotokoll (letzte 200 Einträge, lokal)
js/local.js             Geräte-Speicher (localStorage), nur für Infrastruktur
js/format.js            de-CH-Formatierung (24 h, metrisch)
js/store.js             Datenschicht – EINZIGE Schnittstelle für Daten
js/store/firebase-backend.js   Firestore + Auth (nur von store.js benutzt)
js/store/sim-backend.js        Lokaler Simulator (gleiche Schnittstelle)
js/store/sim-seed.js           Testdaten für den Sim-Modus
js/update.js            Service-Worker-Registrierung, Update-Erkennung, Cache leeren
js/ui/…                 Oberfläche: dom-Helfer, Symbole, Hülle, Router, Ansichten
tools/check.mjs         Regel-Prüfung: node tools/check.mjs (nur Node-Bordmittel)
tools/make_icons.py     Icons einmalig erzeugen (nur Python-Standardbibliothek)
```

### Datenschicht (`js/store.js`)

- Backends austauschbar: `firebase` (Standard) und `sim` (Sim-Modus, lokal, Testdaten,
  kein Login). Gewählt beim Start anhand des Sim-Schalters.
- Firestore mit `persistentLocalCache` (IndexedDB, Mehr-Tab-Manager, unbegrenzte
  Cache-Grösse): Schreibvorgänge werden offline gespeichert und automatisch nachgeliefert,
  auch nach App-Neustart. Gelesene Dokumente (auch privat) bleiben offline verfügbar.
- Datenstruktur `races/{raceId}/…`:
  - `races/{raceId}` – Renn-Dokument (öffentlich per get)
  - `events/{id}` – Ereignisse (`addEvent(type, data)`, `subscribeEvents`)
  - `config/{key}` – Renn-Konfiguration, Wert im Feld `value` (`getConfig`, `setConfig`, `subscribeConfig`)
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
| 1 | Grundgerüst: App-Hülle, Liquid-Glass-Design, Offline/Updates, Datenschicht, Login, Regeln, Sim-Modus, Debug | ✅ erledigt (v0.1.0) |
| 2 | Status-Automat und Befindens-Regler mit Firebase-Sync | offen |
| 3 | Karte: Testroute, Import der offiziellen GPX (nur privat!), Echtzeit-Standort, Versorgungspunkte, eigene POIs, Google-Maps-Knopf | offen |
| 4 | Zeitplan: Gates, Zeitfenster, Fähren-Rechner | offen |
| 5 | Statistik: Tageswerte, Diagramme | offen |
| 6 | Follower-Seite mit geheimem Link | offen |
| 7 | Postbote (Apps Script): Garmin-Mail und LiveTrack | offen |
| 8 | Scriptable: Kurzbefehle, Siri, Widgets, lokale Erinnerungen | offen |
| 9 | Extra: WHIP-Fahrerfeld | offen |

## Design-Grundsätze

- Stil **Liquid Glass** (iOS 26): halbtransparente Flächen mit `backdrop-filter`
  (Unschärfe + leichte Sättigung), feine helle Lichtkante oben, weiche Schatten, grosse
  Rundungen, Kapsel-Formen. Kopfzeile und Tab-Leiste als schwebende Glas-Kapseln.
- Dezenter, ruhiger Hintergrund mit Farbverlauf. **Dunkles Design als Standard.**
- **Lesbarkeit hat Vorrang:** Text und Bedienelemente immer kontraststark, auch auf Glas.
- **Renn-Modus (Glas reduzieren)** unter Mehr → Darstellung: ersetzt alle Glas-Effekte
  durch deckende, kontraststarke Flächen (Sonnenlicht, Akku). Automatisch aktiv bei
  `prefers-reduced-transparency` bzw. `prefers-contrast: more`.
- Alle Farben, Radien, Unschärfe-Werte, Schatten als CSS-Variablen in `css/tokens.css`.
- Touch: Tippflächen **mind. 56 px**, mit Handschuhen bedienbar, `touch-action: manipulation`,
  Eingabefelder **mind. 16 px** (kein Auto-Zoom). Ganze Zeilen tippbar (Schalter).
- iOS-Home-Screen: `viewport-fit=cover`, Safe-Area-Abstände, Statusleiste black-translucent.

## Feste Regeln

- **Das Repository ist öffentlich.** Niemals GPX-Dateien der offiziellen Route, Passwörter,
  Tokens oder persönliche Daten ins Repository. Die offizielle NC4000-Route darf nicht
  weiterverbreitet werden; sie existiert nur im privaten Firebase-Bereich
  (`races/{raceId}/private/**`). Eine selbst erstellte Testroute über die Gate-Orte ist erlaubt.
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
- Design-Änderungen nur über die zentralen CSS-Variablen; Renn-Modus muss immer funktionieren.

### Praktische Ergänzungen

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
