// Versionen der App – die EINZIGE Stelle dafür.
// Bei JEDER Änderung an der App VERSION erhöhen und CHANGELOG.md nachführen.
//
// Der Service Worker erhält die Werte über seine URL (sw.js?v=…&fb=…&lf=…) und
// verwendet VERSION als Cache-Namen. js/update.js liest diese Datei zusätzlich
// direkt vom Server, um neue Versionen zu erkennen – Format darum beibehalten:
// export const NAME = 'wert';
export const VERSION = '0.9.0';

// Fest gepinnte Version des Firebase JS SDK (CDN gstatic). Ein Wechsel ist
// ebenfalls eine Änderung an der App, also VERSION erhöhen.
export const FIREBASE_SDK_VERSION = '12.19.0';

// Fest gepinnte Version der Kartenbibliothek Leaflet (CDN jsDelivr, vom Service
// Worker vorab gespeichert). Ein Wechsel ist eine Änderung an der App.
export const LEAFLET_VERSION = '1.9.4';
