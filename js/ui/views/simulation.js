// Mehr → Simulation: Sim-Modus, simulierte Zeit (mit Zeitraffer), Offline simulieren.

import { clock } from '../../clock.js';
import { formatDateTime, formatNumber, fromDateTimeLocalValue, toDateTimeLocalValue } from '../../format.js';
import * as store from '../../store.js';
import { toast } from '../banners.js';
import { button, h, kv, sectionTitle, switchRow } from '../dom.js';

const FACTORS = [
  [1, '1× – normale Geschwindigkeit'],
  [10, '10×'],
  [60, '60× – 1 Minute = 1 Stunde'],
  [360, '360× – 10 Sekunden = 1 Stunde'],
  [3600, '3600× – 1 Sekunde = 1 Stunde'],
];

function field(label, input) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), input);
}

function simTimeSection(timers) {
  const current = kv('App-Zeit');
  const tick = () => {
    const sim = clock.getSimulation();
    const suffix = sim ? `×${formatNumber(sim.factor, 2)}` : 'Echtzeit';
    current.set(`${formatDateTime(clock.now(), { seconds: true, weekday: true })} · ${suffix}`, sim ? 'is-sim' : '');
  };
  tick();
  timers.push(setInterval(tick, 500));

  const dateInput = h('input', { class: 'input', type: 'datetime-local', value: toDateTimeLocalValue(clock.now()) });
  const activeFactor = clock.getSimulation()?.factor ?? 1;
  const factorSelect = h(
    'select',
    { class: 'select' },
    FACTORS.map(([factor, label]) => h('option', { value: String(factor), text: label, selected: factor === activeFactor })),
  );

  const apply = () => {
    const time = fromDateTimeLocalValue(dateInput.value);
    if (!Number.isFinite(time)) {
      toast('Bitte Datum und Uhrzeit wählen');
      return;
    }
    clock.setSimulation(time, Number(factorSelect.value));
    tick();
    toast('Simulierte Zeit gesetzt');
  };

  const reset = () => {
    clock.resetSimulation();
    dateInput.value = toDateTimeLocalValue(clock.now());
    factorSelect.value = '1';
    tick();
    toast('Zurück auf Echtzeit');
  };

  return [
    sectionTitle('Simulierte Zeit'),
    h(
      'section',
      { class: 'card glass stack' },
      h('div', { class: 'list' }, current.row),
      field('Datum und Uhrzeit', dateInput),
      field('Zeitraffer', factorSelect),
      h('div', { class: 'btn-row' }, button('Übernehmen', { variant: 'sim', onClick: apply }), button('Echtzeit', { onClick: reset })),
    ),
  ];
}

function testDataSection() {
  const reset = async () => {
    if (!window.confirm('Alle Sim-Daten auf die Testdaten zurücksetzen?')) return;
    await store.debug.resetSimData();
    toast('Sim-Daten zurückgesetzt');
  };
  return [
    sectionTitle('Testdaten'),
    h(
      'section',
      { class: 'card glass stack' },
      h('p', { class: 'muted small', text: 'Die Sim-Daten liegen nur auf diesem Gerät. Zurücksetzen stellt die mitgelieferten Testdaten wieder her.' }),
      button('Sim-Daten zurücksetzen', { variant: 'danger', block: true, onClick: reset }),
    ),
  ];
}

export const simulationView = {
  title: 'Simulation',
  render(container) {
    const timers = [];
    const simMode = store.isSimMode();

    const simSwitch = switchRow({
      label: 'Sim-Modus',
      sub: 'Lokaler Simulator mit Testdaten statt Firebase, kein Login nötig. Oben erscheint eine orange Leiste. Die App startet beim Umschalten neu.',
      checked: simMode,
      variant: 'switch-sim',
      onChange: (on, input) => {
        const question = on
          ? 'Sim-Modus einschalten? Die App startet neu und verwendet danach Testdaten statt Firebase.'
          : 'Sim-Modus ausschalten? Die App startet neu und verwendet wieder Firebase.';
        if (!window.confirm(question)) {
          input.checked = !on;
          return;
        }
        store.setSimMode(on);
        window.location.reload();
      },
    });

    const offline = switchRow({
      label: 'Offline simulieren',
      sub: 'Trennt die Datenverbindung (Firebase: disableNetwork). Einträge werden lokal gespeichert und nach dem Ausschalten nachgeliefert. Nach einem Neustart der App wieder aus.',
      checked: store.getStatus().offlineSimulated,
      variant: 'switch-sim',
      onChange: async (on, input) => {
        input.disabled = true;
        try {
          await store.setOfflineSimulated(on);
          toast(on ? 'Verbindung getrennt (simuliert)' : 'Verbindung wieder aktiv');
        } catch (err) {
          input.checked = !on;
          toast(store.describeError(err));
        } finally {
          input.disabled = false;
        }
      },
    });

    container.append(
      h(
        'div',
        { class: 'stack' },
        sectionTitle('Modus'),
        h('div', { class: 'list glass' }, simSwitch.row),
        sectionTitle('Verbindung'),
        h('div', { class: 'list glass' }, offline.row),
        simMode
          ? [...simTimeSection(timers), ...testDataSection()]
          : h('p', { class: 'footnote', text: 'Simulierte Uhrzeit und Zeitraffer gibt es nur im Sim-Modus. Im Firebase-Modus läuft die App immer in Echtzeit.' }),
      ),
    );

    return () => timers.forEach(clearInterval);
  },
};
