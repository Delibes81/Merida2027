// Barra de pestañas para celular: cápsula de vidrio abajo con lo de todos los días
// (hoy o la semana, vuelos, costos, avisos) y "Más" con el resto de las secciones.
(function () {
  'use strict';
  var T = window.Trip, $ = T.$, esc = T.esc;
  var bar = $('tabbar'), sheet = $('dlgMore'), grid = $('moreList');
  if (!bar || !sheet) return;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = window.matchMedia('(max-width: 760px)');
  var SEEN = 'merida2027.seenPost';

  var I = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
  var SECTIONS = [
    { id: 'hoy', label: 'Hoy', c: 'sun', icon: I('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>') },
    { id: 'avisos', label: 'Avisos', c: 'coral', icon: I('<path d="M3.5 10.5v3a1 1 0 0 0 1 1H7l9 5V4.5l-9 5H4.5a1 1 0 0 0-1 1z"/><path d="M7 14.5 8.5 20M19.5 9.5a3.5 3.5 0 0 1 0 5"/>') },
    { id: 'semana', label: 'Semana', c: 'sun', icon: I('<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>') },
    { id: 'boda', label: 'Boda', c: 'pink', icon: I('<circle cx="9" cy="14.5" r="5"/><circle cx="15" cy="14.5" r="5"/><path d="M10 3.5h4l1.5 2L12 8.5l-3.5-3z"/>') },
    { id: 'ruta', label: 'Ruta', c: 'aqua', icon: I('<circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><path d="M8.5 18.5h8a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7h8"/>') },
    { id: 'vuelos', label: 'Vuelos', c: 'aqua', icon: I('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>') },
    { id: 'reservas', label: 'Reservas', c: 'coral', icon: I('<path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z"/>') },
    { id: 'lugares', label: 'Lugares', c: 'aqua', icon: I('<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>') },
    { id: 'pendientes', label: 'Pendientes', c: 'sun', icon: I('<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="m8 12.2 2.8 2.8L16 9.5"/>') },
    { id: 'costos', label: 'Costos', c: 'sun', icon: I('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a1.5 1.5 0 0 1 1.5 1.5V8"/><path d="M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5h12A1.5 1.5 0 0 0 20 18v-8.5A1.5 1.5 0 0 0 18.5 8h-12A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="13.8" r="1.2"/>') },
    { id: 'grupo', label: 'Grupo', c: 'pink', icon: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2a5 5 0 0 1 3 4.6V20"/>') }
  ];
  var MORE = I('<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>');
  var byId = {};
  SECTIONS.forEach(function (s) { byId[s.id] = s; });

  var shown = function (id) { var el = $(id); return !!el && el.getClientRects().length > 0; };
  // Lo de todos los días: hoy (durante el viaje) o la semana, vuelos, costos y avisos (o la boda si aún no entras).
  function slots() { return [shown('hoy') ? 'hoy' : 'semana', 'vuelos', 'costos', T.me ? 'avisos' : 'boda']; }

  // jump: salto en curso tras tocar una pestaña. Dura hasta que el desplazamiento se detiene,
  // que en saltos largos (de Costos a Semana) toma más de un segundo.
  var current = null, key = '', jump = null, settle = 0;

  function paintBar() {
    var s = slots(), k = s.join();
    if (k !== key) {
      key = k;
      bar.innerHTML = '<span class="tab-lens" aria-hidden="true"></span>' + s.map(function (id) {
        var x = byId[id];
        return '<a class="tab" href="#' + id + '" data-go="' + id + '">' + x.icon + '<span>' + x.label + '</span>' +
          (id === 'avisos' ? '<i class="tab-dot" hidden></i>' : '') + '</a>';
      }).join('') +
        '<button class="tab" type="button" id="tabMore" aria-haspopup="dialog" aria-controls="dlgMore" aria-expanded="false">' + MORE + '<span>Más</span></button>';
    }
    mark(); dot();
  }

  // La pestaña activa y el lente de vidrio que se desliza hacia ella.
  function mark() {
    var on = null, inBar = slots().indexOf(current) >= 0;
    T.all('.tab', bar).forEach(function (t) {
      var me = t.id === 'tabMore' ? (current && !inBar) : t.getAttribute('data-go') === current;
      if (me) { t.setAttribute('aria-current', 'true'); on = t; } else t.removeAttribute('aria-current');
    });
    var lens = bar.querySelector('.tab-lens');
    bar.classList.toggle('has-on', !!on);
    if (on && lens) { lens.style.width = on.offsetWidth + 'px'; lens.style.transform = 'translateX(' + on.offsetLeft + 'px)'; }
  }

  // Punto en Avisos cuando hay uno nuevo de alguien más que no has visto.
  function seen() { try { return localStorage.getItem(SEEN) || ''; } catch (e) { return ''; } }
  function dot() {
    var d = bar.querySelector('.tab-dot'), p = T.S.posts && T.S.posts[0];
    if (p && current === 'avisos') { try { localStorage.setItem(SEEN, p.created_at); } catch (e) {} }
    if (d) d.hidden = !(T.me && p && p.author !== T.me.id && p.created_at > seen());
  }

  function goTo(id) {
    var el = $(id);
    if (!el) return;
    jump = { id: id, until: Date.now() + 4000 };
    clearTimeout(settle); settle = setTimeout(endJump, 300);  // por si ya estaba ahí y no hay desplazamiento
    bar.classList.remove('compact');
    current = id; mark(); dot();
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }

  // Al terminar el salto, la pestaña queda en su destino (sin pasar por las secciones intermedias).
  function endJump() {
    if (!jump) return;
    current = jump.id; jump = null; mark(); dot();
  }

  bar.addEventListener('click', function (e) {
    var a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); return goTo(a.getAttribute('data-go')); }
    if (e.target.closest('#tabMore')) openMore();
  });

  // ── "Más": hoja de vidrio que sube desde abajo ──
  function openMore() {
    var s = slots();
    grid.innerHTML = SECTIONS.filter(function (x) { return s.indexOf(x.id) < 0 && shown(x.id); }).map(function (x) {
      return '<li><a class="c-' + x.c + '" href="#' + x.id + '" data-more="' + x.id + '"' + (x.id === current ? ' aria-current="true"' : '') + '>' +
        '<span class="sheet-ico">' + x.icon + '</span>' + esc(x.label) + '</a></li>';
    }).join('');
    sheet.classList.remove('closing'); sheet.style.transform = '';
    sheet.showModal();
    $('tabMore').setAttribute('aria-expanded', 'true');
  }
  function closeMore(then) {
    if (!sheet.open) { if (then) then(); return; }
    var done = function () {
      sheet.close(); sheet.classList.remove('closing'); sheet.style.transform = '';
      var b = $('tabMore'); if (b) { b.setAttribute('aria-expanded', 'false'); }
      if (then) then();
    };
    if (still) return done();
    sheet.classList.add('closing');
    setTimeout(done, 220);
  }
  sheet.addEventListener('click', function (e) {
    var a = e.target.closest('[data-more]');
    if (a) { e.preventDefault(); var id = a.getAttribute('data-more'); return closeMore(function () { goTo(id); }); }
    if (e.target === sheet) closeMore();  // toque fuera de la hoja
  });
  sheet.addEventListener('cancel', function (e) { e.preventDefault(); closeMore(); });

  // Arrastrar la hoja hacia abajo para cerrarla.
  var head = sheet.querySelector('.sheet-head'), drag = null;
  head.addEventListener('pointerdown', function (e) {
    drag = { y: e.clientY, t: Date.now(), dy: 0 };
    head.setPointerCapture(e.pointerId); sheet.classList.add('dragging');
  });
  head.addEventListener('pointermove', function (e) {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    sheet.style.transform = 'translateY(' + drag.dy + 'px)';
  });
  function endDrag() {
    if (!drag) return;
    var fast = drag.dy / Math.max(1, Date.now() - drag.t) > 0.6, far = drag.dy > 90;
    sheet.classList.remove('dragging');
    if (far || (fast && drag.dy > 24)) closeMore(); else sheet.style.transform = '';
    drag = null;
  }
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);

  // ── Sección visible ──
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id === 'inicio' ? null : e.target.id;
        if (jump) return;  // durante un salto manda el destino
        current = id; mark(); dot();
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['inicio'].concat(SECTIONS.map(function (s) { return s.id; })).forEach(function (id) { if ($(id)) spy.observe($(id)); });
  }

  // Al bajar, la cápsula se compacta (solo íconos); al subir, vuelve a mostrar los nombres.
  var lastY = window.scrollY, acc = 0, ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY, d = y - lastY, end = y + window.innerHeight > document.documentElement.scrollHeight - 80;
      lastY = y;
      if (jump) {  // el desplazamiento que provoca un toque no compacta la barra
        acc = 0; clearTimeout(settle);
        if (Date.now() > jump.until) endJump(); else settle = setTimeout(endJump, 180);
        return;
      }
      acc = d > 0 ? Math.max(0, acc) + d : Math.min(0, acc) + d;
      if (y < 160 || end || acc < -24) bar.classList.remove('compact');
      else if (acc > 48) bar.classList.add('compact');
    });
  }, { passive: true });

  // Mientras escribes, la barra se quita para no tapar el campo ni el teclado.
  var typing = function (el) { return el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select'); };
  document.addEventListener('focusin', function (e) { if (typing(e.target)) document.body.classList.add('typing'); });
  document.addEventListener('focusout', function () {
    setTimeout(function () { if (!typing(document.activeElement)) document.body.classList.remove('typing'); }, 0);
  });

  window.addEventListener('resize', mark);
  if (phone.addEventListener) phone.addEventListener('change', function () { if (!phone.matches) closeMore(); mark(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(mark);
  // Cuando llega un aviso nuevo (también en tiempo real), se revisa el punto.
  var loadPosts = T.load.posts;
  if (loadPosts) T.load.posts = function () { return Promise.resolve(loadPosts.apply(this, arguments)).then(dot); };
  T.painters.push(paintBar);
  paintBar();
})();
