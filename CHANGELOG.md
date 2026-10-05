# Changelog

Alle Änderungen an der App. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionen nach [SemVer](https://semver.org/lang/de/). Die Versionsnummer steht ausschliesslich in
`js/version.js` und wird bei jeder Änderung erhöht.

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
