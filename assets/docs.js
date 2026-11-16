// Documentos del viaje: archivos privados en Supabase Storage, ligados a una reserva.
(function () {
  'use strict';
  var T = window.Trip, $ = T.$, esc = T.esc;
  var BUCKET = 'viaje', MAX = 10 * 1024 * 1024;
  var TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
  var FILE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/></svg>';
  T.S.docs = [];
  var ready = true, target = null;

  // Lista de documentos de una reserva; la usa la sección Reservas.
  T.docsHtml = function (ref) {
    var list = T.S.docs.filter(function (d) { return d.ref === ref; });
    return '<div class="docs">' + (list.length ? '<ul>' + list.map(function (d) {
      var m = T.byId[d.uploaded_by];
      return '<li><button class="doc" type="button" data-doc="' + esc(d.id) + '">' + FILE + '<span><b>' + esc(d.title) + '</b><small>' +
        (m ? 'Subió ' + esc(m.name) : '') + '</small></span></button>' +
        (d.uploaded_by === T.me.id ? '<button class="icon-btn" type="button" data-doc-del="' + esc(d.id) + '" aria-label="Borrar ' + esc(d.title) + '">' + T.TRASH + '</button>' : '') + '</li>';
    }).join('') + '</ul>' : '') +
      '<button class="btn" type="button" data-doc-add="' + ref + '">Adjuntar documento</button></div>';
  };

  T.load.docs = async function () {
    var r = await T.sb.from('docs').select('*').order('created_at', { ascending: true });
    ready = !r.error;
    if (r.error) return;
    T.S.docs = r.data; T.paintStays();
  };
  T.resets.push(function () { T.S.docs = []; });

  document.addEventListener('click', async function (e) {
    var add = e.target.closest('[data-doc-add]');
    if (add) {
      if (!ready) return T.toast('Falta actualizar la base: corre de nuevo supabase/schema.sql.');
      target = add.getAttribute('data-doc-add'); $('docFile').value = ''; $('docFile').click();
      return;
    }
    var op = e.target.closest('[data-doc]');
    if (op) {
      var doc = T.S.docs.filter(function (d) { return d.id === op.getAttribute('data-doc'); })[0];
      // La pestaña se abre en el mismo toque (si no, el navegador la bloquea) y luego recibe el enlace temporal.
      var w = window.open('', '_blank');
      var r = await T.sb.storage.from(BUCKET).createSignedUrl(doc.path, 300);
      if (r.error || !r.data) { if (w) w.close(); return T.toast('No se pudo abrir el documento.'); }
      if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
      return;
    }
    var del = e.target.closest('[data-doc-del]');
    if (del) {
      var d = T.S.docs.filter(function (x) { return x.id === del.getAttribute('data-doc-del'); })[0], before = T.S.docs;
      T.S.docs = before.filter(function (x) { return x !== d; }); T.paintStays();
      var rr = await T.sb.from('docs').delete().eq('id', d.id);
      if (rr.error) { T.S.docs = before; T.paintStays(); return T.toast('No se pudo borrar. Intenta de nuevo.'); }
      await T.sb.storage.from(BUCKET).remove([d.path]);
      T.toast('Documento borrado.');
    }
  });

  $('docFile').addEventListener('change', async function () {
    var f = this.files && this.files[0];
    if (!f || !target || !T.me) return;
    var ext = TYPES[f.type];
    if (!ext) return T.toast('Solo se aceptan PDF o imágenes.');
    if (f.size > MAX) return T.toast('El archivo pesa más de 10 MB.');
    var id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    var path = target + '/' + id + '.' + ext;
    var title = f.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Documento';
    T.toast('Subiendo ' + title + '…');
    var up = await T.sb.storage.from(BUCKET).upload(path, f, { contentType: f.type });
    if (up.error) return T.toast('No se pudo subir el archivo. Intenta de nuevo.');
    var r = await T.sb.from('docs').insert({ ref: target, title: title, path: path, mime: f.type, size: f.size, uploaded_by: T.me.id });
    if (r.error) { await T.sb.storage.from(BUCKET).remove([path]); return T.toast('No se pudo guardar el documento.'); }
    T.toast('Documento guardado.'); T.load.docs();
  });
})();
