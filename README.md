# NorthCape 4000 – Renn-App

PWA für das NorthCape 4000 (Start 24. Juli 2027 in Rovereto, Ziel Nordkapp).
Läuft als Home-Screen-App auf dem iPhone, komplett offline-fähig, Daten in Firebase.

**App:** https://simongraf-ultracycling.github.io/northcape4000/

Projektgrundlage, Architektur und feste Regeln: [CLAUDE.md](CLAUDE.md) ·
Änderungen: [CHANGELOG.md](CHANGELOG.md)

## Einrichtung (einmalig)

### 1. GitHub Pages

GitHub → Repository → **Settings → Pages** → *Build and deployment*:
Source **GitHub Actions** wählen (wird sofort gespeichert).

Veröffentlicht wird danach automatisch bei jedem Push auf `main` durch den Ablauf
[`.github/workflows/pages.yml`](.github/workflows/pages.yml): Er prüft zuerst die festen
Regeln (`node tools/check.mjs`) – bei Fehlern wird nicht veröffentlicht – und stellt dann
nur die App-Dateien online. Manuell starten: **Actions → Veröffentlichen → Run workflow**.
Nach 1–2 Minuten ist die App unter der Adresse oben erreichbar.

### 2. Firebase Authentication

In der [Firebase-Konsole](https://console.firebase.google.com) → Projekt **northcape-4000**:

1. **Authentication → Sign-in method:** *E-Mail/Passwort* aktiviert lassen.
2. **Authentication → Users:** Dein Konto existiert bereits (UID `BhdmzQX0tIWNeN6C7ib1TIczwUk2`,
   muss mit `OWNER_UID` in `js/config.js` und in `firestore.rules` übereinstimmen).
3. **Authentication → Settings → User actions:** *Enable create (sign-up)* ausschalten,
   damit niemand sonst ein Konto anlegen kann.
4. **Authentication → Settings → Authorized domains:** `simongraf-ultracycling.github.io`
   hinzufügen.

### 3. Firestore-Sicherheitsregeln veröffentlichen

Solange die Regeln nicht veröffentlicht sind, ist alles gesperrt – auch für dich
(Debug zeigt dann "Keine Leseberechtigung – Regeln veröffentlicht?").

1. Firebase-Konsole → Projekt **northcape-4000** → links **Firestore Database**.
2. Oben den Reiter **Regeln** (Rules) öffnen.
3. Den gesamten Inhalt im Editor löschen.
4. Den kompletten Inhalt der Datei [`firestore.rules`](firestore.rules) aus diesem
   Repository einfügen (auf GitHub die Datei öffnen → *Raw* → alles kopieren).
5. **Veröffentlichen** (Publish) klicken. Die Regeln wirken nach rund einer Minute.
6. Kontrolle in der App: **Mehr → Debug → "Follower-Sicht prüfen"** – alle Zeilen
   müssen ✓ zeigen (Privates und Auflisten verboten, Rennen und Ereignisse lesbar).

Was die Regeln bewirken:

| Pfad | Lesen | Schreiben |
|------|-------|-----------|
| `races/{raceId}` | jeder mit raceId (nur gezielt, `get`) | nur Besitzer |
| `races` auflisten | verboten | – |
| `races/{raceId}/events, config, debug, …` | jeder mit raceId | nur Besitzer |
| `races/{raceId}/private/**` | **nur Besitzer** | nur Besitzer |
| alles andere | verboten | verboten |

### 4. Optional: API-Schlüssel einschränken

Der Firebase-Web-Schlüssel in `js/config.js` ist kein Geheimnis (GitHub meldet ihn
evtl. trotzdem als "Secret" – das ist erwartet). Zusätzlicher Schutz:
[Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=northcape-4000)
→ *Browser key* → **Website-Einschränkungen** (HTTP-Referrer):
`https://simongraf-ultracycling.github.io/*`. Danach die App testen (Login, Debug).

## Auf dem iPhone installieren

1. Die App-Adresse in **Safari** öffnen.
2. Teilen-Knopf → **Zum Home-Bildschirm** → *Hinzufügen*.
3. App vom Home-Bildschirm starten, anmelden. Danach bleibt sie angemeldet und startet
   auch ohne Netz.

## Neue Version veröffentlichen

1. Änderungen machen, `VERSION` in `js/version.js` erhöhen, `CHANGELOG.md` nachführen.
2. `node tools/check.mjs` ausführen (muss "✓ Alles in Ordnung" melden).
3. Committen und auf `main` bringen. Der Ablauf "Veröffentlichen" prüft und veröffentlicht
   automatisch (Actions → Veröffentlichen).
4. In der App erscheint (beim nächsten Öffnen bzw. spätestens nach 30 Minuten) das Banner
   **"Neue Version – tippen zum Laden"**. Sofort prüfen: Mehr → Debug → "Nach Update suchen".

## Fehlerbehebung

**Update erscheint nicht in der App.** In der App unter Mehr → Debug → "Nach Update suchen"
tippen. Steht dort "Aktuell (Server: v…)" mit der alten Nummer, ist die neue Version noch
nicht veröffentlicht (siehe nächster Punkt).

**Veröffentlichung hängt oder schlägt fehl.** GitHub → Repository → **Actions** →
"Veröffentlichen" → obersten Lauf öffnen. Rot bei "Prüfen": `tools/check.mjs` hat einen
Regelverstoss gefunden (Details im Protokoll). Lange "Queued": "Cancel workflow", dann
oben rechts **Run workflow**. Bleibt auch der neue Lauf hängen, hat GitHub eine Störung:
[githubstatus.com](https://www.githubstatus.com) ("Actions", "Pages") – dann hilft nur
warten. (Läufe, die länger als 24 Stunden in der Warteschlange stehen, bricht GitHub
selbst ab.)

**App startet nicht mehr.** Nach 15 Sekunden erscheint eine Notfall-Anzeige mit
"Cache leeren und neu laden" (braucht Netz). Erfasste Daten bleiben erhalten.

## Entwicklung

Kein Build, kein npm. Lokal testen:

```sh
python3 -m http.server 8080      # im Repository-Ordner
# → http://localhost:8080/  (Service Worker funktioniert auf localhost)
```

- `node tools/check.mjs` – prüft die festen Regeln (Precache-Liste in `sw.js`, Syntax,
  Zeit nur über `clock.now()`, Firebase nur in der Datenschicht, kein Tracking,
  Schweizer Schreibweise, keine GPX-Dateien, CHANGELOG-Eintrag).
- `python3 tools/make_icons.py` – erzeugt die App-Icons neu.
- **Sim-Modus** (Mehr → Simulation, oder "Sim-Modus (ohne Login)" auf dem Login-Bildschirm):
  lokaler Simulator mit Testdaten, simulierte Uhrzeit mit Zeitraffer, kein Firebase.

## Datenschutz

- Kein Tracking, keine Analyse-Dienste.
- Die offizielle NC4000-Route und eigene POIs liegen ausschliesslich im privaten
  Firebase-Bereich (`races/{raceId}/private/**`) – nie im Repository.
- Follower sehen später nur, was unter `races/{raceId}` ausserhalb von `private` liegt.
