// Anmelde-Bildschirm (nur Firebase-Modus). Nach der ersten Anmeldung bleibt
// die App dauerhaft angemeldet.

import * as store from '../../store.js';
import { button, h } from '../dom.js';

function field(label, input) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), input);
}

export function renderLogin(container, { onSimMode }) {
  const email = h('input', {
    class: 'input',
    type: 'email',
    name: 'email',
    autocomplete: 'username',
    inputmode: 'email',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    required: true,
  });
  const password = h('input', { class: 'input', type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = button('Anmelden', { variant: 'primary', block: true, type: 'submit' });
  const offlineHint = h('p', { class: 'form-error', text: 'Kein Netz – für die erste Anmeldung braucht es eine Internetverbindung.' });

  const updateOnline = () => {
    offlineHint.hidden = navigator.onLine;
  };
  updateOnline();
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);

  const onSubmit = async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (!email.value.trim() || !password.value) {
      error.textContent = 'Bitte E-Mail und Passwort eingeben.';
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Anmelden …';
    try {
      await store.signIn(email.value, password.value);
      // Weiter geht es über store.onAuthChange (js/app.js)
    } catch (err) {
      error.textContent = store.describeError(err);
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Anmelden';
    }
  };

  container.append(
    h(
      'div',
      { class: 'login' },
      h(
        'div',
        { class: 'login-card glass' },
        h('img', { class: 'login-logo', src: 'icons/icon-192.png', alt: '' }),
        h('h1', { text: 'NorthCape 4000' }),
        h('p', { class: 'login-intro', text: 'Einmal anmelden – danach bleibt die App dauerhaft angemeldet.' }),
        offlineHint,
        h('form', { class: 'stack', novalidate: true, onSubmit }, field('E-Mail', email), field('Passwort', password), error, submit),
        button('Sim-Modus (ohne Login)', { block: true, onClick: onSimMode }),
      ),
    ),
  );

  return () => {
    window.removeEventListener('online', updateOnline);
    window.removeEventListener('offline', updateOnline);
  };
}
