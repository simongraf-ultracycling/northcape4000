// Projekt-Konfiguration.
// ACHTUNG: Das Repository und die Website sind öffentlich. Hier nur Werte, die
// ohnehin im Browser sichtbar sind – niemals Passwörter, Tokens oder Routen.

// Firebase-Web-Konfiguration. Diese Werte sind kein Geheimnis; geschützt werden
// die Daten durch firestore.rules (siehe README.md).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAWtWwW0rlUBnTziwQZd06yLqlP08bp1ww',
  authDomain: 'northcape-4000.firebaseapp.com',
  projectId: 'northcape-4000',
  storageBucket: 'northcape-4000.firebasestorage.app',
  messagingSenderId: '713399112927',
  appId: '1:713399112927:web:22ddc6f23fc8bd75b6856a',
};

// Firebase-UID des Besitzers. Nur dieses Konto darf schreiben und den privaten
// Bereich lesen. Muss mit isOwner() in firestore.rules übereinstimmen.
export const OWNER_UID = 'BhdmzQX0tIWNeN6C7ib1TIczwUk2';

// Lange zufällige ID des Rennens: Alle Daten liegen unter races/{RACE_ID}/…
// Hinweis: Weil diese Datei öffentlich ist, ist die ID hier NICHT geheim –
// siehe "Offene Punkte" in CLAUDE.md (vor Etappe 6 klären).
export const RACE_ID = 'U6y0GxvMOOfRX0fCCB4oQloDsocSlDxC';
