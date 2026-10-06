# Changelog

Alle Änderungen an der App. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionen nach [SemVer](https://semver.org/lang/de/). Die Versionsnummer steht ausschliesslich in
`js/version.js` und wird bei jeder Änderung erhöht.

## [0.8.0] – 2026-10-06

Etappe 3: Karte, Routen, Versorgung und Tagesplanung.

### Neu

- **Karte** (Tab "Karte") mit **15 Hintergründen**: Velo (CyclOSM), OpenStreetMap,
  OpenStreetMap DE, OpenStreetMap FR, Humanitarian, OpenTopoMap, Esri Topo,
  Esri Strassen, Satellit (Esri), CARTO Voyager, CARTO Hell, CARTO Dunkel,
  swisstopo Landeskarte, swisstopo Luftbild und "Ohne Hintergrund". "Automatisch" wählt
  Velo (CyclOSM) bzw. CARTO Dunkel passend zum Farbmodus. Dazu **Überlagerungen**:
  Velorouten (Waymarked Trails), Relief (Schummerung), Orte und Grenzen (für Satellit).
- Auf der Karte: Route mit Etappen und **Lücken** (z.B. Fähren, gestrichelt),
  km-Marken je nach Zoom, Etappennummern, Wegpunkte/Gates aus den GPX-Dateien,
  geplante **Schlafstopps**, Tagesetappen abwechselnd gefärbt (Schalter), eigener
  Standort mit Richtung, Folgen-Modus, "Ganze Route zeigen". Route antippen → km-Info
  (Höhe, Etappe, Ankunft, Höhenmeter bis dorthin, Google Maps).
- Unten: **Lage auf der Route** (km, verbleibend, Etappe), **Voraus** – die nächsten
  Versorgungspunkte mit Distanz, Ankunftszeit und "offen bei Ankunft" – und das
  **Höhenprofil** (antippen markiert den Punkt auf der Karte).
- **Routen** (Karte → Routen-Pille): GPX-Import einer Gesamtroute oder **mehrerer
  Etappen** (auch mehrere Dateien auf einmal); Etappen umbenennen, sortieren,
  löschen oder **zu einer Strecke zusammenfügen**. Lücken zwischen Etappen (Fähren)
  zählen nicht als Strecke. Mehrere Routen speicherbar, eine ist aktiv.
  Selbst erstellte **Testroute** Rovereto → München → Berlin → Gränna → Rovaniemi →
  Nordkapp (7 Etappen, rund 3'450 km) zum Ausprobieren.
- **Versorgung aus OpenStreetMap** entlang der Route: Supermärkte, Tankstellen,
  Bäckereien, Trinkwasser, Velowerkstätten und Unterkünfte (Korridor einstellbar;
  Unterkünfte in breiterem Korridor). Ladefortschritt, abbrechen und später fortsetzen.
  **Öffnungszeiten** werden ausgewertet: offen jetzt, offen bei Ankunft, **24 h
  geöffnet** hervorgehoben (goldener Ring) und als Filter "Nur 24 h geöffnet".
- **Eigene Punkte:** lange auf die Karte tippen → "Dieser Ort" → als eigenen Punkt
  speichern (Name, Notiz), bearbeiten, löschen. Erscheinen auf der Karte und in "Voraus".
- **Google-Maps-Knopf** bei jedem Punkt (Velo-Navigation dorthin).
- **Plan** (Tab "Plan"): **Tagesetappen mit Schlafstopps** – automatisch aus Start,
  Tempo, Steigleistung, Fahrzeit, Pausen und Schlaf; jeder Schlafstopp lässt sich auf
  einen km festlegen oder auf eine **Unterkunft in der Nähe** setzen ("Als
  Schlafstopp"). Geplante Ankunft an Wegpunkten/Gates und im Ziel.
- **Standort bei Statuswechsel:** Jeder Status-Eintrag bekommt die aktuelle Position
  (`position`), bei Fehlern `positionError`. Abschaltbar unter Karte → Routen.
- **Offline:** Die Kartenbibliothek (Leaflet 1.9.4) ist vorab gespeichert, angesehene
  Kartenausschnitte werden gespeichert (bis 6000 Kacheln). Ohne Netz bleiben Route,
  Punkte, Profil und Standort voll nutzbar – Hintergrund aus gespeicherten Kacheln oder
  schlicht.

### Technisches

- Routen, Versorgung, Plan und eigene Punkte liegen **nur im privaten Bereich**
  (`private/routes`, `route-…`, `routegeo-…`, `pois-…`, `poisdata-…`, `plan-…`,
  `mypois`). Koordinaten als kodierte Polyline, in Abschnitten unter 1 MB.
- GPX wird in einem Web Worker gelesen und vereinfacht (3D-Douglas-Peucker, 5 m);
  Höhenmeter mit 5-m-Hysterese.
- Für die Versorgung wird die vereinfachte Route in Abschnitten an Overpass
  (OpenStreetMap) gesendet – nur Koordinaten, keine Konten-Daten.
- Leaflet per jsDelivr mit fester Version (`LEAFLET_VERSION` in `js/version.js`),
  Content-Security-Policy um Karten- und Overpass-Server ergänzt; `tools/check.mjs`
  prüft, dass jeder Kartenserver in CSP und Service Worker eingetragen ist.
- Neue Datenschicht-Funktion `store.deletePrivate(key)`.

## [0.7.0] – 2026-10-06

Etappe 2: Status-Automat und Befinden.

### Neu

- **Status-Tab:** aktueller Status gross mit Symbol, Farbe und Dauer ("seit 14:32 ·
  1 h 23 min"). Zustände: Fahren, Pause, Versorgung, Hotel, Schlafen, Wach.
- **Grosse Knöpfe für die nächsten Schritte** (mit Handschuhen bedienbar), der
  wahrscheinlichste zuerst – z.B. beim Fahren "Pause", "Versorgung", "Hotel",
  "Schlafen"; nach dem Aufwachen "Losgefahren". Alle übrigen Zustände unter
  "Anderer Status …". Doppeltipp-Schutz und 8 Sekunden "Rückgängig" per Banner.
- **Heute:** Fahrzeit, Pausen und Schlaf seit Mitternacht.
- **Befinden:** vier Regler 0–10 – Müdigkeit, Sitzprobleme, Mental, Motivation –
  mit Farbe (gut/mittel/schlecht) und "Befinden speichern".
- **Verlauf** der Statuswechsel und Befinden-Einträge mit Dauer; antippen zum
  Korrigieren: Zeitpunkt ändern oder Eintrag löschen (zweistufig).
- Alles offline-fähig: Einträge sind sofort gespeichert und werden nachgeliefert;
  noch nicht synchronisierte zeigen ⇅.
- Datenschicht: `store.updateEvent(id, felder)` für Korrekturen (Felder werden
  ergänzt; gelöschte Einträge bleiben mit `voided: true` erhalten).
- Fachlogik in `js/model/status.js` und `js/model/befinden.js` (auch für Statistik und
  Follower-Seite); Sim-Testdaten mit rund 28 Stunden Verlauf.

## [0.6.0] – 2026-10-06

### Geändert

- **Unschärfe oben behoben:** Die iOS-Statusleiste ist jetzt deckend
  (`apple-mobile-web-app-status-bar-style` "default") und trägt die Hintergrundfarbe des
  Farbmodus (`theme-color`). Bisher lief die App unter der Statusleiste durch
  ("black-translucent") – ab iOS 26 legt iOS dann selbst eine Unschärfe über den oberen
  Rand. **iOS übernimmt die Änderung nur beim Hinzufügen zum Home-Bildschirm:** Die App
  erkennt alte Installationen und zeigt eine Anleitung zum Neu-Hinzufügen (ausblendbar).
- Die Abdunklung hinter der Statusleiste bei hellen Farbmodi entfällt.
- Die Tab-Leiste ist freigestellt: Der Inhalt läuft dahinter und rundherum durch, die
  Pille selbst ist deckend und konzentrisch zu den Bildschirmecken.
- Nur noch ein Design (bisher "Klar"); die fünf Farbmodi und "Automatisch" bleiben.
  Die Design-Auswahl ist entfernt.
- Die Anmeldeseite zeigt die Versionsnummer.

## [0.5.0] – 2026-10-05

### Geändert

- Oben gibt es keine Unschärfe mehr: Kopf- und Fussbereich sind deckend in der
  Hintergrundfarbe, Inhalt verschwindet sauber unter Titel und Tab-Leiste. Beim
  Scrollen erscheint unter dem Titel eine feine Linie.
- Farbe und Form sind getrennt einstellbar (Mehr → Darstellung):
  - **Farbmodus** – neutral und flach, ohne Farbverläufe: **Weiss**, **Hellgrau**,
    **Dunkelgrau**, **Dunkelblau** (Standard), **Schwarz** und **Automatisch** (folgt dem
    iPhone: Weiss bei Hell, Dunkelblau bei Dunkel).
  - **Design** – zehn ruhige Varianten der schlichten, runden Form, die sich in Schrift,
    Knöpfen, Symbolen, Karten und Tabs unterscheiden statt nur in der Farbe: **Klar**
    (Standard, wie iOS), **Rund**, **Fein**, **Kräftig**, **Klassik**, **Technik**,
    **Avenir**, **Helvetica**, **Glas** und **Geometrisch**.
- Renn-Modus behält den gewählten Farbmodus, macht alle Flächen deckend, Ränder
  deutlicher, entfernt Schatten und setzt die Schrift auf maximalen Kontrast.
- Bisherige Einstellungen werden übernommen (Dunkel → Dunkelblau, Hell → Weiss); die
  Designs aus 0.4.0 entfallen (→ Klar).

## [0.4.0] – 2026-10-05

### Geändert

- Die App ist jetzt allgemein für lange Bikepacking-Touren und Ultracycling-Rennen
  gedacht (App-Name "Bikepacking"); das NorthCape 4000 2027 ist das erste Ziel.
  Texte, Plan-Platzhalter und Sim-Testdaten sind entsprechend allgemein.
- Oben gibt es keine Kopfzeilen-Pille mehr: Der obere Rand verschwimmt weich (wie in
  iOS 26), der Titel steht als Text darauf; Zurück und Verbindung sind kleine runde
  Glas-Pillen.
- Die Tab-Leiste sitzt tiefer und verläuft konzentrisch zu den Bildschirmecken des
  iPhones (Eckradius je Modell, Abstand = Eckradius − halbe Leistenhöhe).
- Knöpfe, Eingabefelder, Segment-Schalter, Tabs und Toasts sind durchgehend runde Pillen.

### Neu

- Zehn schlichte Liquid-Glass-Designs, jedes dunkel und hell, klar unterscheidbar durch
  Farbwelt, Glas (klar bis stark mattiert) und Akzent: **Polarnacht** (Standard),
  **Gletscher**, **Wald**, **Sand**, **Abendrot**, **Rosé**, **Lavendel** (runde Schrift),
  **Graphit** (monochrom), **Carbon** (Tiefschwarz, klares Glas) und **Mitternacht**
  (Tintenblau und Gold).

### Entfernt

- Die Designs aus 0.3.0 (Neon-Velodrom, Beton, Terminal, Gazzetta, Plakat, Topo,
  Mondrian, Holo, Skizze) samt ihrer Sonder-Variablen (Rahmenstile, harte Schatten,
  Muster, schiefe Karten …). Wer eines davon gewählt hatte, landet bei Polarnacht.

## [0.3.0] – 2026-10-05

### Neu

- Zehn radikal unterschiedliche Designs statt fünf, jedes dunkel und hell:
  **Polarnacht** (Liquid Glass, Original), **Neon-Velodrom** (Synthwave mit Laser-Gitter,
  Neon-Glühen, schrägen Knöpfen), **Beton** (Brutalismus: dicke Rahmen, harte Schatten),
  **Terminal** (grüner Phosphor-Bildschirm, hell als LCD-Velocomputer), **Gazzetta** (rosa
  Sportzeitung, Didot-Schlagzeilen), **Plakat** (Schweizer Plakatstil, rote angedockte
  Kopfzeile), **Topo** (Wanderkarte mit Höhenlinien, gestrichelte Rahmen), **Mondrian**
  (Farbblöcke wie das La-Vie-Claire-Trikot), **Holo** (Y2K-Regenbogen-Chrom) und
  **Skizze** (Notizbuch mit Handschrift und Klebezetteln, dunkel als Wandtafel).
- Neue Form-Variablen: Rahmenstärke und -stil, harte Schatten, Glühen, Hintergrundmuster,
  Kopfzeilen- und Tab-Leisten-Farben, angedockte Leisten, schief liegende Karten,
  Knopf-Form (z.B. schräg), Symbol-Strichstärke, Schriften pro Titel/Abschnitt/Knopf.

### Entfernt

- Die Designs Mitternachtssonne, Fjord, Graphit und Alpen (zu ähnlich). Wer eines davon
  gewählt hatte, landet automatisch bei Polarnacht.

## [0.2.0] – 2026-10-05

### Neu

- Fünf Designs zur Wahl unter Mehr → Darstellung, jedes mit Dunkel- und Hellmodus:
  **Polarnacht** (Nordlicht-Blau, viel Glas – bisheriges Design), **Mitternachtssonne**
  (warm, Goldgelb, runde Schrift), **Fjord** (Tiefgrün und Nebel), **Graphit** (kantig,
  Signalgelb, wenig Glas, Titel in Monospace) und **Alpen** (Schwarz/Weiss/Rot,
  Serifen-Titel).
- Erscheinungsbild Dunkel, Hell oder Automatisch (folgt der iPhone-Einstellung);
  Standard bleibt Dunkel mit Polarnacht.
- Renn-Modus gibt es jetzt auch hell (weisse, deckende Flächen, schwarze Schrift); er
  gilt für jedes Design und behält dessen Akzentfarbe.
- Vorschau-Kacheln und Vorschau-Karte in der Darstellungs-Auswahl.

### Geändert

- `css/tokens.css` neu gegliedert: Grundwerte, gemeinsame Werte je Modus, je Design ein
  Form-Block und je ein Farbblock für Dunkel und Hell, Renn-Modus (dunkel/hell).
- Im Hellmodus wird der Bereich hinter der iOS-Statusleiste leicht abgedunkelt, damit Uhr
  und Akku lesbar bleiben.
- `tools/check.mjs` prüft, dass jedes Design in `js/ui/display.js`, `js/boot.js` und
  `css/tokens.css` (Dunkel und Hell, alle Farbwerte) vorhanden ist.

## [0.1.0] – 2026-10-05

Etappe 1: Grundgerüst.

### Neu

- App-Hülle mit schwebender Glas-Kopfzeile und unterer Tab-Leiste (Status, Karte, Plan,
  Statistik, Mehr); Status, Karte, Plan und Statistik vorerst als Platzhalter.
- iOS-Home-Screen-App: Manifest, Icons (180/192/512 px, Motiv Mitternachtssonne),
  Statusleiste black-translucent, Safe-Area-Abstände, Tippflächen mind. 56 px.
- Design "Liquid Glass" mit zentralen CSS-Variablen (`css/tokens.css`) und Renn-Modus
  (Glas reduzieren), automatisch bei "Transparenz reduzieren" / "Kontrast erhöhen".
- Service Worker: alle App- und Firebase-SDK-Dateien vorab gecacht, App startet offline;
  Update-Banner "Neue Version – tippen zum Laden".
- Datenschicht `js/store.js` mit Backends "firebase" (Firestore mit Offline-Speicher) und
  "sim" (lokaler Simulator mit Testdaten); Einträge mit `clientTime` und `serverTime`.
- Anmeldung mit E-Mail/Passwort, dauerhaft angemeldet; Abmelden unter Mehr.
- Sicherheitsregeln `firestore.rules`: Schreiben nur Besitzer, `private/**` nur Besitzer,
  races nicht auflistbar.
- Zeit-Abstraktion `clock.now()`, Sim-Modus mit simulierter Uhrzeit, Zeitraffer und
  "Offline simulieren"; orange Sim-Leiste.
- Debug-Bereich: Zustand (Version, Netz, Service Worker, Verbindung, Login, ausstehende
  Schreibvorgänge, Speicher), Test-Eintrag, Privat-Test, Follower-Sicht prüfen,
  Nach Update suchen, Cache leeren, Fehlerprotokoll (200 Einträge, kopierbar).
- Notfall-Anzeige, falls die App nicht startet ("Cache leeren und neu laden").
- `tools/check.mjs` prüft die festen Regeln; `tools/make_icons.py` erzeugt die Icons.
