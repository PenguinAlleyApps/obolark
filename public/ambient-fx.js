/* Obolark · Ambient FX helpers
   Drop-in vanilla JS. No dependencies. Works with ambient-fx.css.

   Usage:
     <link rel="stylesheet" href="./colors_and_type.css">
     <link rel="stylesheet" href="./ambient-fx.css">
     <body class="fx-atmosphere fx-embers fx-smoke fx-flicker">
       ...
       <script src="./ambient-fx.js"></script>
     </body>

   Or call ObolarkFX.mount(opts) manually to customize. */
(function () {
  'use strict';

  const DEFAULTS = {
    emberCount: 16,
    emberMinDuration: 10,   // seconds
    emberMaxDuration: 20,
    containerSelector: 'body',
  };

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function mountEmbers(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const container = document.querySelector(o.containerSelector);
    if (!container) return null;

    // Don't double-mount
    let field = container.querySelector('.fx-ember-field');
    if (!field) {
      field = document.createElement('div');
      field.className = 'fx-ember-field';
      field.setAttribute('aria-hidden', 'true');
      container.appendChild(field);
    } else {
      field.innerHTML = '';
    }

    const count = getComputedCount(o.emberCount);
    for (let i = 0; i < count; i++) {
      const e = document.createElement('span');
      const size = Math.random() < 0.3 ? 'large' : (Math.random() < 0.5 ? 'small' : '');
      e.className = 'fx-ember' + (size ? ' ' + size : '');
      e.style.setProperty('--x', rand(0, 100).toFixed(2) + 'vw');
      e.style.setProperty('--dur', rand(o.emberMinDuration, o.emberMaxDuration).toFixed(1) + 's');
      e.style.setProperty('--delay', (-rand(0, o.emberMaxDuration)).toFixed(1) + 's');
      field.appendChild(e);
    }
    return field;
  }

  function getComputedCount(fallback) {
    const root = document.documentElement;
    const v = getComputedStyle(root).getPropertyValue('--fx-ember-count').trim();
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  // Auto-mount if body opts in via .fx-embers, but NEVER in day mode
  function autoMount() {
    if (!document.body) return;
    const isDay = document.documentElement.getAttribute('data-theme') === 'day';
    if (!isDay && document.body.classList.contains('fx-embers')) {
      mountEmbers();
    }
  }

  // Watch for theme flips — clear embers on day, remount on night
  function observeTheme() {
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      const isDay = root.getAttribute('data-theme') === 'day';
      const field = document.body && document.body.querySelector('.fx-ember-field');
      if (isDay) {
        if (field) field.innerHTML = '';
      } else if (document.body && document.body.classList.contains('fx-embers')) {
        mountEmbers();
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { autoMount(); observeTheme(); });
  } else {
    autoMount();
    observeTheme();
  }

  window.ObolarkFX = {
    mountEmbers,
    refresh: autoMount,
  };
})();
