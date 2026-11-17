// Modo "hoy": durante el viaje, la página abre con lo de ese día.
// Se puede previsualizar agregando ?hoy=2027-02-26T14:30 a la dirección.
(function () {
  'use strict';
  var T = window.Trip, $ = T.$, esc = T.esc;
  var DAYS = [
    { d: '2027-02-25', id: 'jue', stay: 'hacienda' },
    { d: '2027-02-26', id: 'vie', stay: 'hacienda' },
    { d: '2027-02-27', id: 'sab', stay: 'chuburna' },
    { d: '2027-02-28', id: 'dom', stay: 'chuburna' },
    { d: '2027-03-01', id: 'lun', stay: 'merida' },
    { d: '2027-03-02', id: 'mar', stay: null }
  ];
  // Lo que tiene hora fija (hora de Mérida).
  var EVENTS = [
    { t: '2027-02-25T17:00', what: 'Rompehielos', where: 'Bar con alberca de la hacienda' },
    { t: '2027-02-26T13:00', what: 'Ceremonia religiosa', where: 'Capilla de la Hacienda' },
    { t: '2027-02-26T15:00', what: 'Recepción', where: 'Jardín Fuente del Sapo' },
    { t: '2027-02-26T17:00', what: 'Cena y fiesta', where: 'Jardín de la Casa Principal' }
  ];
  var at = function (local) { return new Date(local + ':00-06:00').getTime(); };
  var longDate = function (d) {
    return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z'));
  };
  function until(ms) {
    var min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return 'en ' + min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return 'en ' + h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  function paint() {
    var now = window.tripNow(), today = new Date(now - 6 * 36e5).toISOString().slice(0, 10);
    var i = -1;
    DAYS.forEach(function (x, n) { if (x.d === today) i = n; });
    $('hoy').hidden = i < 0;
    T.all('#nav a[href="#hoy"]').forEach(function (a) { a.hidden = i < 0; });
    if (i < 0) return;
    var day = DAYS[i], src = $(day.id), me = T.me;

    var events = EVENTS.filter(function (e) { return e.t.slice(0, 10) === today; });
    var f = me && T.S.flights[me.id];
    if (f) {  // tu propio vuelo, si es hoy
      if (f.arr_time && (f.arr_date || me.arr || '2027-02-25') === today) events.push({ t: today + 'T' + String(f.arr_time).slice(0, 5), what: 'Tu vuelo llega a Mérida', where: f.arr_flight || '' });
      if (f.arr_leave && (f.arr_date || me.arr || '2027-02-25') === today) events.push({ t: today + 'T' + String(f.arr_leave).slice(0, 5), what: 'Sale tu vuelo a Mérida', where: f.arr_flight || '' });
      if (f.dep_time && (f.dep_date || me.to || '2027-03-02') === today) events.push({ t: today + 'T' + String(f.dep_time).slice(0, 5), what: 'Tu vuelo sale de Mérida', where: [f.dep_flight, f.dep_land && 'llega a las ' + String(f.dep_land).slice(0, 5)].filter(Boolean).join(' · ') });
    }
    events.sort(function (a, b) { return a.t < b.t ? -1 : 1; });
    var next = events.filter(function (e) { return at(e.t) > now; })[0];
    var nextHtml = next
      ? '<p class="eyebrow">Lo que sigue</p><p class="hoy-time">' + next.t.slice(11) + '<span>' + until(at(next.t) - now) + '</span></p>' +
        '<p class="hoy-what">' + esc(next.what) + '</p>' + (next.where ? '<p class="hoy-where">' + esc(next.where) + '</p>' : '')
      : '<p class="eyebrow">Lo que sigue</p><p class="hoy-what">' + (events.length ? 'Ya pasó lo que tenía hora fija.' : 'Hoy no hay nada con hora fija.') + '</p><p class="hoy-where">El resto del día es a nuestro ritmo.</p>';

    var stayHtml;
    if (day.stay) {
      var base = T.STAYS.filter(function (s) { return s.id === day.stay; })[0], d = (me && T.S.stays[day.stay]) || {};
      var q = d.address || (day.stay === 'hacienda' ? base.name + ' ' + base.place : base.place);
      stayHtml = '<p class="eyebrow">Esta noche dormimos en</p><p class="hoy-what">' + esc(d.name || base.name) + '</p><p class="hoy-where">' + esc(d.address || base.place) + '</p>' +
        '<a class="btn" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) + '" target="_blank" rel="noopener">Cómo llegar</a>';
    } else {
      stayHtml = '<p class="eyebrow">Esta noche</p><p class="hoy-what">Ya en casa</p><p class="hoy-where">Entregamos la camioneta antes de ir al aeropuerto.</p>';
    }

    var post = me && T.S.posts && T.S.posts[0], author = post && T.byId[post.author];
    $('hoyBody').innerHTML =
      '<div class="hoy-head"><p class="eyebrow">Día ' + (i + 1) + ' de ' + DAYS.length + ' · ' + esc(longDate(today)) + '</p>' +
      '<h2>' + esc(src.querySelector('h3').textContent) + '</h2></div>' +
      '<div class="hoy-grid"><div class="hoy-box hot">' + nextHtml + '</div><div class="hoy-box">' + stayHtml + '</div></div>' +
      (author ? '<a class="hoy-post" href="#avisos"><b>Último aviso · ' + esc(author.name) + '</b><span>' + esc(post.body) + '</span></a>' : '') +
      // La agenda del día se toma tal cual del itinerario de la página.
      '<ul class="ev c-sun">' + src.querySelector('.ev').innerHTML + '</ul>' +
      '<a class="btn" href="#' + day.id + '">Ver la semana completa</a>';
  }

  T.painters.push(paint);
  T.paintHoy = paint;
  setInterval(paint, 30000);
})();
