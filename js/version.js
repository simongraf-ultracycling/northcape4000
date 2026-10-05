// Versionen der App – die EINZIGE Stelle dafür.
// Bei JEDER Änderung an der App VERSION erhöhen und CHANGELOG.md nachführen.
//
// Der Service Worker erhält beide Werte über seine URL (sw.js?v=…&fb=…) und
// verwendet VERSION als Cache-Namen. js/update.js liest diese Datei zusätzlich
// direkt vom Server, um neue Versionen zu erkennen – Format darum beibehalten:
// export const NAME = 'wert';
export const VERSION = '0.4.0';

// Fest gepinnte Version des Firebase JS SDK (CDN gstatic). Ein Wechsel ist
// ebenfalls eine Änderung an der App, also VERSION erhöhen.
export const FIREBASE_SDK_VERSION = '12.19.0';
