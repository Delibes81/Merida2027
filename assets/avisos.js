// Muro de avisos del grupo.
(function () {
  'use strict';
  var T = window.Trip, $ = T.$, esc = T.esc;
  T.S.posts = [];

  function ago(ts) {
    var s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'ahora';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    if (s < 172800) return 'ayer';
    return T.fmtDate(new Date(ts).toISOString().slice(0, 10));
  }

  function paint() {
    if (!T.me) { $('posts').innerHTML = ''; return; }
    $('posts').innerHTML = T.S.posts.length ? T.S.posts.map(function (p) {
      var m = T.byId[p.author];
      if (!m) return '';
      return '<li class="card post">' + T.av(m) + '<div class="post-main"><p class="post-meta"><b>' + esc(m.name) + '</b><span>' + ago(p.created_at) + '</span></p>' +
        '<p class="post-body">' + esc(p.body) + '</p></div>' +
        (p.author === T.me.id ? '<button class="icon-btn" type="button" data-post-del="' + esc(p.id) + '" aria-label="Borrar aviso">' + T.TRASH + '</button>' : '') + '</li>';
    }).join('') : '<li class="empty">Todavía no hay avisos. Aquí van los cambios de horario, los puntos de encuentro y lo que todos deban saber.</li>';
  }

  T.load.posts = async function () {
    var r = await T.sb.from('posts').select('*').order('created_at', { ascending: false });
    if (r.error) return;
    T.S.posts = r.data; paint();
  };
  T.painters.push(paint);
  T.resets.push(function () { T.S.posts = []; });

  $('postForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = $('postBody').value.trim();
    if (!body || !T.me) return;
    T.busy(this, true);
    var r = await T.sb.from('posts').insert({ body: body, author: T.me.id });
    T.busy(this, false);
    if (r.error) return T.toast('No se pudo publicar. Intenta de nuevo.');
    $('postBody').value = ''; T.toast('Aviso publicado.'); T.load.posts();
  });

  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-post-del]');
    if (!b) return;
    var id = b.getAttribute('data-post-del'), before = T.S.posts;
    T.S.posts = before.filter(function (p) { return p.id !== id; }); paint();
    var r = await T.sb.from('posts').delete().eq('id', id);
    if (r.error) { T.S.posts = before; paint(); T.toast('No se pudo borrar. Intenta de nuevo.'); }
  });

  // Refresca los "hace 5 min" sin recargar.
  setInterval(function () { if (T.me && T.S.posts.length) paint(); }, 60000);
})();
