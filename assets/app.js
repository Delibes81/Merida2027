(function () {
  var $ = function (id) { return document.getElementById(id); };
  var DAY = 864e5;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

  // Reloj del viaje. Para ver cómo se verá un día, agrega ?hoy=2027-02-26 o ?hoy=2027-02-26T14:30 (hora de Mérida).
  var shift = 0;
  try {
    var q = new URLSearchParams(location.search).get('hoy');
    if (q && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(q)) shift = new Date((q.length === 10 ? q + 'T09:00' : q) + ':00-06:00').getTime() - Date.now();
  } catch (e) {}
  var now = window.tripNow = function () { return Date.now() + (shift || 0); };

  // Tema claro (el que abre) u oscuro. La elección se guarda en el teléfono; index.html la aplica antes de pintar.
  var root = document.documentElement, themeBtn = $('themeBtn');
  var token = window.tripToken = function (name) { return getComputedStyle(root).getPropertyValue(name).trim(); };

  // En celular, con un diálogo abierto la página de atrás se congela donde estaba.
  // Si el iPhone la desplaza al salir el teclado, dibuja el cursor fuera del campo.
  // Se hace al momento de abrir y cerrar (no después), para que un salto de sección
  // pedido justo al cerrar no lo deshaga el regreso a la posición guardada.
  (function () {
    if (!window.HTMLDialogElement || !window.matchMedia('(pointer: coarse)').matches) return;
    var keep = 0, frozen = false, P = HTMLDialogElement.prototype, show = P.showModal, shut = P.close;
    function freeze() {
      if (frozen) return;
      keep = window.scrollY; frozen = true;
      document.body.style.top = -keep + 'px'; document.body.classList.add('frozen');
    }
    function thaw() {
      if (!frozen || document.querySelector('dialog.dlg[open]')) return;
      frozen = false; window.tripThawAt = Date.now();
      document.body.classList.remove('frozen'); document.body.style.top = '';
      root.style.scrollBehavior = 'auto'; window.scrollTo(0, keep); root.style.scrollBehavior = '';
    }
    P.showModal = function () { var r = show.apply(this, arguments); if (this.classList.contains('dlg')) freeze(); return r; };
    P.close = function () { var r = shut.apply(this, arguments); thaw(); return r; };
    document.addEventListener('close', thaw, true);  // también al cerrar con el gesto o la tecla de regresar
  })();
  function syncTheme() {
    var dark = root.getAttribute('data-theme') === 'dark';
    themeBtn.setAttribute('aria-checked', dark);
    themeBtn.title = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    document.querySelector('meta[name="theme-color"]').content = token('--bg');
  }
  function setTheme(dark) {
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    syncTheme();
    window.dispatchEvent(new Event('themechange'));
  }
  themeBtn.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') !== 'dark';
    try { localStorage.setItem('merida2027.theme', dark ? 'dark' : 'light'); } catch (e) {}
    if (document.startViewTransition && !still) document.startViewTransition(function () { setTheme(dark); });
    else setTheme(dark);
  });
  // Si lo cambias en otra pestaña, esta se pone igual.
  window.addEventListener('storage', function (e) { if (e.key === 'merida2027.theme') setTheme(e.newValue === 'dark'); });
  syncTheme();

  // Cuenta regresiva al rompehielos (hora de Mérida, UTC-6)
  var target = new Date('2027-02-25T17:00:00-06:00').getTime();
  function tick() {
    var ms = target - now();
    if (ms <= 0) {
      $('count').hidden = true;
      $('countTo').textContent = ms > -6 * DAY ? '¡Ya estamos en Mérida!' : 'Qué viaje. Hasta la próxima.';
      return;
    }
    $('cd').textContent = Math.floor(ms / DAY);
    $('ch').textContent = pad(Math.floor(ms % DAY / 36e5));
    $('cm').textContent = pad(Math.floor(ms % 36e5 / 6e4));
    $('cs').textContent = pad(Math.floor(ms % 6e4 / 1e3));
  }
  tick(); setInterval(tick, 1000);

  // Día de hoy en la tira de la semana (fecha en Mérida)
  var hoy = new Date(now() - 6 * 36e5).toISOString().slice(0, 10);
  [].forEach.call(document.querySelectorAll('#week .day'), function (d) {
    if (d.getAttribute('data-d') === hoy) d.classList.add('today');
  });

  // Fechas límite
  [].forEach.call(document.querySelectorAll('.due[data-due]'), function (el) {
    var left = Math.ceil((new Date(el.getAttribute('data-due') + 'T23:59:59-06:00').getTime() - now()) / DAY);
    var lbl = el.getAttribute('data-label');
    if (left < 1) { el.textContent = 'venció el ' + lbl; el.classList.add('late'); }
    else el.textContent = 'antes del ' + lbl + ' · ' + (left === 1 ? 'último día' : left + ' días');
  });

  // Camioneta
  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  function calc() {
    var total = +$('c-total').value || 0;
    var pers = Math.max(1, +$('c-pers').value || 1);
    var dias = Math.max(1, +$('c-dias').value || 1);
    $('c-pp').textContent = mxn.format(total / pers);
    $('c-det').textContent = mxn.format(total / pers / dias) + ' por persona al día';
  }
  ['c-total', 'c-pers', 'c-dias'].forEach(function (id) { $(id).addEventListener('input', calc); });
  calc();

  // Sección activa en la barra y trazo del mapa al entrar en pantalla
  if ('IntersectionObserver' in window) {
    var links = {};
    [].forEach.call(document.querySelectorAll('#nav a'), function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        for (var k in links) links[k].classList.toggle('on', k === e.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (var k in links) spy.observe($(k));
    var mapObs = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { $('map').classList.add('draw'); mapObs.disconnect(); }
    }, { threshold: .35 });
    mapObs.observe($('map'));
  }

  // App instalable y disponible sin señal
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    $('install').hidden = false; $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', function () {
    if (!installEvt) return;
    installEvt.prompt(); installEvt = null; $('install').hidden = true;
  });
  window.addEventListener('appinstalled', function () { $('install').hidden = true; });
  // En iPhone no hay botón de instalar: se hace desde Compartir.
  if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    $('installTxt').textContent = 'Lleva el plan en tu iPhone: toca Compartir y luego "Agregar a pantalla de inicio". Se abre como app y funciona sin señal.';
    $('install').hidden = false;
  }

  // Mar de la portada
  var cv = $('sea'), cx = cv.getContext('2d'), sun = $('sun'), W, H, sx, sr, top, dpr;
  function size() {
    var r = cv.getBoundingClientRect(), s = sun.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    sr = sun.offsetWidth / 2;
    sx = sun.offsetLeft + sr;
    top = sun.offsetTop + sr * 1.24;
  }
  // Cuatro capas de olas, de mar adentro a la orilla; el color de cada una lo pone el tema (--sea-1 a --sea-4).
  var layers = [
    { a: 7, l: 340, v: .55, y: 0 },
    { a: 9, l: 250, v: -.8, y: .26 },
    { a: 8, l: 190, v: 1.1, y: .55 },
    { a: 6, l: 150, v: -1.4, y: .84 }
  ];
  var glint;  // de día el reflejo del sol es claro; al atardecer, naranja
  function tint() { layers.forEach(function (L, i) { L.c = token('--sea-' + (i + 1)); }); glint = token('--glint'); }
  tint();
  window.addEventListener('themechange', function () { tint(); draw(performance.now()); });
  function draw(ms) {
    var t = ms / 1000, depth = H - top;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    layers.forEach(function (L, i) {
      var y0 = top + depth * L.y;
      cx.beginPath(); cx.moveTo(0, H);
      for (var x = 0; x <= W + 8; x += 8) {
        cx.lineTo(x, y0 + Math.sin(x / L.l + t * L.v) * L.a + Math.sin(x / (L.l * .37) - t * L.v * 1.6) * L.a * .35);
      }
      cx.lineTo(W, H); cx.closePath(); cx.fillStyle = L.c; cx.fill();
      if (i === 0) {
        // reflejo del sol
        for (var k = 0; k < 9; k++) {
          var w = sr * 1.5 * (1 - k / 11) * (.62 + .38 * Math.sin(t * 1.3 + k * 1.9));
          var yy = y0 + 14 + k * (depth * .8 / 9);
          cx.fillStyle = 'rgba(' + (glint || '255, ' + (150 - k * 7) + ', ' + (95 + k * 6)) + ', ' + (.55 - k * .05) + ')';
          cx.fillRect(sx - w / 2 + Math.sin(t + k) * 6, yy, w, 3);
        }
      }
    });
  }
  size(); draw(0);
  window.addEventListener('resize', function () { size(); draw(performance.now()); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { size(); draw(performance.now()); });
  if (!still) {
    var seen = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }).observe(cv);
    (function loop(ms) { if (seen) draw(ms); requestAnimationFrame(loop); })(0);
  }
})();
