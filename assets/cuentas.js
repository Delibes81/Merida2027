// Dividir una cuenta: una sesión compartida donde cada quien marca lo que pidió y avisa
// cuando pagó su parte. La página lleva la suma para que no falte nada por asignar ni por pagar.
// Si alguien pagó todo, la cuenta puede pasar a gastos con el monto exacto de cada uno.
(function () {
  'use strict';
  var T = window.Trip, $ = T.$, all = T.all, esc = T.esc, money = T.money;
  var M = T.MEMBERS;
  T.S.tickets = []; T.S.items = []; T.S.claims = []; T.S.payments = [];
  var cents = function (n) { return Math.round(Number(n) * 100); };
  var uuid = function () { return crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2); };
  var find = function (id) { return T.S.tickets.filter(function (x) { return x.id === id; })[0]; };
  var names = function (ids) { return ids.map(function (id) { return T.byId[id].name; }).join(', '); };

  // Cuánto le toca a cada quien, en centavos. Un renglón se reparte parejo entre quienes
  // lo marcaron; la propina, en proporción a lo que consumió cada uno.
  function compute(t) {
    var items = T.S.items.filter(function (i) { return i.ticket_id === t.id; });
    var sub = {}, unassigned = 0, itemsTotal = 0;
    items.forEach(function (i) {
      var c = cents(i.amount); itemsTotal += c;
      var who = M.filter(function (m) { return T.S.claims.some(function (k) { return k.item_id === i.id && k.member_id === m.id; }); });
      if (!who.length) { unassigned += c; return; }
      var share = Math.floor(c / who.length), extra = c - share * who.length;
      who.forEach(function (m, n) { sub[m.id] = (sub[m.id] || 0) + share + (n < extra ? 1 : 0); });
    });
    var tip = cents(t.tip || 0), assigned = itemsTotal - unassigned, total = {}, given = 0;
    var ids = M.map(function (m) { return m.id; }).filter(function (id) { return sub[id]; });
    var rest = [];
    ids.forEach(function (id) {
      var exact = assigned ? tip * sub[id] / assigned : 0, part = Math.floor(exact);
      total[id] = sub[id] + part; given += part; rest.push([id, exact - part]);
    });
    // Los centavos sobrantes de la propina van a quienes quedaron más cerca del siguiente centavo.
    rest.sort(function (x, y) { return y[1] - x[1]; });
    for (var n = 0; n < tip - given && rest.length; n++) total[rest[n % rest.length][0]] += 1;

    // Pagos avisados: cuánto dijo cada quien que pagó, contra lo que le toca ahora.
    var paid = {}, paidTotal = 0, owing = [], owed = 0, over = 0;
    T.S.payments.forEach(function (p) { if (p.ticket_id === t.id && T.byId[p.member_id]) { paid[p.member_id] = cents(p.amount); paidTotal += cents(p.amount); } });
    M.forEach(function (m) {
      var d = (total[m.id] || 0) - (paid[m.id] || 0);
      if (d > 0) { owed += d; owing.push(m.id); } else over -= d;
    });
    var people = M.map(function (m) { return m.id; }).filter(function (id) { return total[id] || paid[id]; });
    return { items: items, total: total, ids: ids, people: people, unassigned: unassigned, itemsTotal: itemsTotal, tip: tip, grand: itemsTotal + tip,
      paid: paid, paidTotal: paidTotal, owing: owing, owed: owed, over: over, complete: items.length > 0 && !unassigned && !owed && !over };
  }

  function statusHtml(t, c) {
    var lines = [];
    if (!c.items.length) lines.push('<p>Agrega los renglones del ticket para empezar.</p>');
    if (c.unassigned) lines.push('<p class="warn">Faltan ' + money(c.unassigned) + ' por asignar: toca quién pidió cada renglón.</p>');
    if (t.paid_by) {
      if (c.items.length && !c.unassigned) lines.push('<p class="ok">Todo asignado. Ya puede pasar a gastos.</p>');
      return '<div class="tk-status">' + lines.join('') + '</div>';
    }
    if (c.owed) lines.push('<p class="warn">Faltan ' + money(c.owed) + ' por pagar: ' + esc(names(c.owing)) + '.</p>');
    if (c.over) lines.push('<p class="warn">Hay ' + money(c.over) + ' pagados de más: revisen los renglones marcados.</p>');
    if (c.complete) lines.push('<p class="ok">Cuenta completa: todo está asignado y pagado.</p>');
    var pct = c.grand ? Math.min(100, Math.round(100 * c.paidTotal / c.grand)) : 0;
    return '<div class="tk-status"><div class="tk-bar"><i style="width: ' + pct + '%"></i></div>' +
      '<p class="tk-sum"><b>' + money(c.paidTotal) + '</b> pagados de <b>' + money(c.grand) + '</b></p>' + lines.join('') + '</div>';
  }

  function peopleHtml(t, c) {
    if (!c.people.length) return '';
    return '<div class="tk-people"><p class="eyebrow">' + (t.paid_by ? 'Lo que le toca a cada quien' : 'Lo que paga cada quien') + '</p><ul>' + c.people.map(function (id) {
      var due = c.total[id] || 0, paid = c.paid[id], has = paid != null, note = '';
      if (has && paid < due) note = '<small class="warn">pagó ' + money(paid) + ', le faltan ' + money(due - paid) + '</small>';
      else if (has && paid > due) note = '<small class="warn">pagó ' + money(paid) + ', ' + money(paid - due) + ' de más</small>';
      return '<li><span class="who">' + esc(T.byId[id].name) + note + '</span><span class="amt">' + money(due) + '</span>' +
        (t.paid_by ? '' : '<button type="button" class="vote" aria-pressed="' + has + '" data-pay="' + esc(t.id) + '|' + id + '">' + (has ? '✓ Pagó' : 'Ya pagó') + '</button>') + '</li>';
    }).join('') + '</ul></div>';
  }

  function paint() {
    if (!T.me) { $('tickets').innerHTML = ''; return; }
    var open = all('#tickets details[open]').map(function (d) { return d.closest('[data-tk]').getAttribute('data-tk'); });
    // La cuenta se repinta cada vez que alguien marca algo: se conserva lo que cada quien
    // tenga a medio escribir (renglón, texto pegado, propina) y dónde tenía el cursor.
    var FIELDS = ['.tk-add input[name=name]', '.tk-add input[name=amount]', '.tk-paste textarea', '[data-tk-tip]'];
    var active = document.activeElement, drafts = [];
    all('#tickets [data-tk]').forEach(function (art) {
      FIELDS.forEach(function (sel, n) {
        var el = art.querySelector(sel);
        if (!el) return;
        var focus = el === active;
        if (n === 3 ? focus : (el.value || focus)) drafts.push({ tk: art.getAttribute('data-tk'), sel: sel, value: el.value, focus: focus });
      });
    });
    $('tickets').innerHTML = T.S.tickets.length ? T.S.tickets.map(function (t) {
      var c = compute(t), payer = T.byId[t.paid_by], mine = t.created_by === T.me.id;
      var sub = (payer ? 'Pagó ' + esc(payer.name) : 'Cada quien paga lo suyo') + ' · ' + money(c.grand);
      if (t.expense_id || t.closed) {
        return '<article class="tk closed" data-tk="' + esc(t.id) + '"><header><div><b>' + esc(t.title) + '</b><small>' + sub + '</small></div>' +
          '<span class="pill">' + (t.expense_id ? 'En gastos' : 'Saldada') + '</span>' +
          (t.closed && !t.expense_id ? '<button class="btn" type="button" data-tk-open="' + esc(t.id) + '">Reabrir</button>' : '') + '</header></article>';
      }
      var rows = c.items.map(function (i) {
        var has = function (m) { return T.S.claims.some(function (k) { return k.item_id === i.id && k.member_id === m.id; }); };
        return '<li><div class="tk-row"><span class="tk-name">' + esc(i.name) + '</span><span class="amt">' + money(cents(i.amount)) + '</span>' +
          '<button class="icon-btn" type="button" data-item-del="' + esc(i.id) + '" aria-label="Quitar ' + esc(i.name) + '">' + T.TRASH + '</button></div>' +
          '<div class="tk-who">' + M.map(function (m) {
            return '<button type="button" class="pick" style="--h: ' + m.h + '" aria-pressed="' + has(m) + '" data-pick="' + esc(i.id) + '|' + m.id + '" title="' + esc(m.name) + '" aria-label="' + esc(m.name) + ' pidió ' + esc(i.name) + '">' + esc(m.name.slice(0, 2)) + '</button>';
          }).join('') + '<button type="button" class="vote" data-pick-all="' + esc(i.id) + '">Todos</button></div></li>';
      }).join('');
      return '<article class="tk" data-tk="' + esc(t.id) + '">' +
        '<header><div><b>' + esc(t.title) + '</b><small>' + sub + '</small></div><div class="tk-tools">' +
          '<button class="btn" type="button" data-tk-share="' + esc(t.id) + '">Compartir</button>' +
          (mine ? '<button class="icon-btn" type="button" data-tk-del="' + esc(t.id) + '" aria-label="Borrar ' + esc(t.title) + '">' + T.TRASH + '</button>' : '') + '</div></header>' +
        statusHtml(t, c) +
        '<ul class="tk-items">' + rows + '</ul>' +
        '<form class="tk-add" data-tk-add="' + esc(t.id) + '"><input name="name" type="text" maxlength="80" placeholder="Renglón" aria-label="Nombre del renglón" required>' +
        '<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="$" aria-label="Importe" required><button class="btn" type="submit">Agregar</button></form>' +
        '<details class="tk-paste"><summary>Pegar varios renglones</summary>' +
        '<p>Un renglón por línea, con el importe al final. Si quieres, agrega quién lo pidió con @: <b>Nachos 220 @Jorge, Zamy</b> o <b>@todos</b>. Sirve para pegar lo que lea de la foto tu lector de tickets o cualquier asistente.</p>' +
        '<p class="tk-ask" data-ask>' + ASK + '</p><button class="btn" type="button" data-copy-ask>Copiar instrucción</button>' +
        '<textarea rows="5" placeholder="Cochinita 180 @Jorge&#10;2 Cerveza 100&#10;Nachos 220 @todos&#10;Propina 40" aria-label="Renglones para pegar"></textarea>' +
        '<button class="btn" type="button" data-tk-paste="' + esc(t.id) + '">Agregar renglones</button></details>' +
        '<label class="tk-tip">Propina<input type="number" inputmode="decimal" min="0" step="0.01" value="' + (Number(t.tip) || '') + '" placeholder="0" data-tk-tip="' + esc(t.id) + '"></label>' +
        peopleHtml(t, c) +
        '<label class="tk-tip tk-mode">Cómo se paga<select data-tk-payer="' + esc(t.id) + '"><option value="">Cada quien paga lo suyo</option>' +
          M.map(function (m) { return '<option value="' + m.id + '"' + (t.paid_by === m.id ? ' selected' : '') + '>Pagó ' + esc(m.name) + ' y se le repone</option>'; }).join('') + '</select></label>' +
        (t.paid_by
          ? '<button class="btn hot" type="button" data-tk-close="' + esc(t.id) + '"' + (c.unassigned || !c.items.length ? ' disabled' : '') + '>Pasar a gastos</button>'
          : '<button class="btn hot" type="button" data-tk-done="' + esc(t.id) + '"' + (c.complete ? '' : ' disabled') + '>Cerrar cuenta</button>') +
        '</article>';
    }).join('') : '<p class="empty">Todavía no hay cuentas por dividir.</p>';
    open.forEach(function (id) { var d = document.querySelector('[data-tk="' + id + '"] details'); if (d) d.open = true; });
    drafts.forEach(function (d) {
      var el = document.querySelector('[data-tk="' + d.tk + '"] ' + d.sel);
      if (!el) return;
      el.value = d.value;
      if (d.focus) { el.focus(); try { el.setSelectionRange(d.value.length, d.value.length); } catch (e) {} }
    });
    focusLinked();
  }

  // Enlace directo a una cuenta: ?cuenta=<id> lleva a ella en cuanto carga.
  var linked = null, focused = false;
  try { linked = new URLSearchParams(location.search).get('cuenta'); } catch (e) {}
  function focusLinked() {
    if (!linked) return;
    var el = document.querySelector('[data-tk="' + linked.replace(/[^\w-]/g, '') + '"]');
    if (!el) return;
    el.classList.add('focus');  // se vuelve a marcar en cada repintado; el salto solo ocurre una vez
    if (focused) return;
    focused = true;
    setTimeout(function () { var now = document.querySelector('.tk.focus'); if (now) now.scrollIntoView({ block: 'start' }); }, 400);
  }
  if (linked) setTimeout(function () { if (!T.me) T.openJoin(); }, 2500);

  // Convierte texto pegado en renglones: "Cochinita 180", "2 Cerveza $100.00", "Propina 40".
  // Opcional, quién lo pidió: "Nachos 220 @Jorge, Zamy" o "@todos". Formato completo en docs/agente-tickets.md.
  var ASK = 'Lee este ticket y dame un renglón por línea con el formato: nombre importe. Sin subtotal, IVA ni total. Si hay propina, ponla en una línea que diga Propina. Si te digo quién pidió algo, agrégalo al final con @ y los nombres.';
  var plain = function (x) { return String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); };
  function parseLines(text) {
    var items = [], tip = null, unknown = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      line = line.replace(/^[\s|*\-•·`]+|[\s|`]+$/g, '');
      if (/^ojo\b/i.test(line)) return;
      var at = line.indexOf('@'), who = [];
      if (at > -1) {
        line.slice(at + 1).split(/,|;|&|\s+y\s+/).forEach(function (n) {
          n = plain(n.replace('@', ''));
          if (!n) return;
          if (n === 'todos' || n === 'todas') return M.forEach(function (m) { if (who.indexOf(m.id) < 0) who.push(m.id); });
          var m = M.filter(function (x) { return plain(x.name) === n; })[0];
          if (m) { if (who.indexOf(m.id) < 0) who.push(m.id); } else unknown.push(n);
        });
        line = line.slice(0, at).trim();
      }
      var m = line.match(/^(.*?)[\s:.\-|$]*\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)$/);
      if (!m) return;
      var name = m[1].replace(/[\s:.\-|$]+$/, '').trim(), amount = Number(m[2].replace(/,/g, ''));
      if (!name || !(amount > 0)) return;
      if (/^(sub\s?total|total|i\.?v\.?a\.?|cambio|efectivo|tarjeta|importe|su pago|pago)\b/i.test(name)) return;
      if (/^(propina|servicio)\b/i.test(name)) { tip = amount; return; }
      items.push({ name: name.slice(0, 80), amount: Math.round(amount * 100) / 100, who: who });
    });
    return { items: items, tip: tip, unknown: unknown };
  }

  var timer;
  async function reload() {
    var r = await Promise.all([
      T.sb.from('tickets').select('*').order('created_at', { ascending: false }),
      T.sb.from('ticket_items').select('*').order('sort', { ascending: true }),
      T.sb.from('ticket_claims').select('*'),
      T.sb.from('ticket_payments').select('*')
    ]);
    if (r[0].error || r[1].error || r[2].error) return;
    T.S.tickets = r[0].data; T.S.items = r[1].data; T.S.claims = r[2].data; T.S.payments = r[3].error ? [] : r[3].data;
    paint();
  }
  var soon = function () { clearTimeout(timer); timer = setTimeout(reload, 120); };
  T.load.tickets = reload; T.load.ticket_items = soon; T.load.ticket_claims = soon; T.load.ticket_payments = soon;
  T.painters.push(paint);
  T.resets.push(function () { T.S.tickets = []; T.S.items = []; T.S.claims = []; T.S.payments = []; });
  var failed = function () { T.toast('No se pudo guardar. Intenta de nuevo.'); reload(); };

  // ── Marcar quién pidió qué ──
  async function setClaim(item, member, on) {
    var before = T.S.claims;
    T.S.claims = before.filter(function (k) { return !(k.item_id === item && k.member_id === member); });
    if (on) T.S.claims = T.S.claims.concat([{ item_id: item, member_id: member }]);
    paint();
    var r = on ? await T.sb.from('ticket_claims').insert({ item_id: item, member_id: member })
      : await T.sb.from('ticket_claims').delete().eq('item_id', item).eq('member_id', member);
    if (r.error) failed();
  }

  // ── Avisar que alguien ya pagó su parte (se guarda cuánto pagó en ese momento) ──
  async function togglePay(tid, member) {
    var t = find(tid), c = compute(t), has = c.paid[member] != null, r;
    T.S.payments = T.S.payments.filter(function (p) { return !(p.ticket_id === tid && p.member_id === member); });
    if (has) {
      paint();
      r = await T.sb.from('ticket_payments').delete().eq('ticket_id', tid).eq('member_id', member);
    } else {
      var row = { ticket_id: tid, member_id: member, amount: (c.total[member] || 0) / 100 };
      T.S.payments = T.S.payments.concat([row]); paint();
      r = await T.sb.from('ticket_payments').insert(row);
    }
    if (r.error) return failed();
    if (!has && compute(t).complete) T.toast('Cuenta completa: todo está asignado y pagado.');
  }

  async function share(tid) {
    var t = find(tid), url = location.origin + '/?cuenta=' + tid;
    var text = 'Cuenta "' + t.title + '": entra y marca lo que pediste.';
    try {
      if (navigator.share) return await navigator.share({ title: t.title, text: text, url: url });
      await navigator.clipboard.writeText(text + ' ' + url); T.toast('Enlace copiado. Pégalo en el chat del grupo.');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      T.toast('Comparte este enlace: ' + url);
    }
  }

  document.addEventListener('click', async function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-pick]'))) {
      var p = b.getAttribute('data-pick').split('|');
      return setClaim(p[0], p[1], b.getAttribute('aria-pressed') !== 'true');
    }
    if ((b = t.closest('[data-pay]'))) { var pp = b.getAttribute('data-pay').split('|'); return togglePay(pp[0], pp[1]); }
    if ((b = t.closest('[data-tk-share]'))) return share(b.getAttribute('data-tk-share'));
    if ((b = t.closest('[data-pick-all]'))) {
      var item = b.getAttribute('data-pick-all');
      var has = T.S.claims.filter(function (k) { return k.item_id === item; }).map(function (k) { return k.member_id; });
      var everyone = has.length === M.length, r;
      if (everyone) {
        T.S.claims = T.S.claims.filter(function (k) { return k.item_id !== item; }); paint();
        r = await T.sb.from('ticket_claims').delete().eq('item_id', item);
      } else {
        var rows = M.filter(function (m) { return has.indexOf(m.id) < 0; }).map(function (m) { return { item_id: item, member_id: m.id }; });
        T.S.claims = T.S.claims.concat(rows); paint();
        r = await T.sb.from('ticket_claims').insert(rows);
      }
      if (r.error) failed();
      return;
    }
    if ((b = t.closest('[data-item-del]'))) {
      var id = b.getAttribute('data-item-del');
      T.S.items = T.S.items.filter(function (i) { return i.id !== id; }); paint();
      if ((await T.sb.from('ticket_items').delete().eq('id', id)).error) failed();
      return;
    }
    if ((b = t.closest('[data-tk-del]'))) {
      var tid = b.getAttribute('data-tk-del');
      T.S.tickets = T.S.tickets.filter(function (x) { return x.id !== tid; }); paint();
      if ((await T.sb.from('tickets').delete().eq('id', tid)).error) failed(); else T.toast('Cuenta borrada.');
      return;
    }
    if ((b = t.closest('[data-tk-done]')) || (b = t.closest('[data-tk-open]'))) {
      var done = b.hasAttribute('data-tk-done'), did = b.getAttribute(done ? 'data-tk-done' : 'data-tk-open');
      find(did).closed = done; paint();
      if ((await T.sb.from('tickets').update({ closed: done }).eq('id', did)).error) return failed();
      return T.toast(done ? 'Cuenta cerrada: quedó saldada.' : 'Cuenta reabierta.');
    }
    if ((b = t.closest('[data-tk-close]'))) return closeTicket(b.getAttribute('data-tk-close'), b);
    if ((b = t.closest('[data-copy-ask]'))) {
      try { await navigator.clipboard.writeText(ASK); T.toast('Instrucción copiada.'); }
      catch (err) { var el = b.parentNode.querySelector('[data-ask]'), sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(rg); T.toast('Mantén presionado el texto para copiarlo.'); }
      return;
    }
    if ((b = t.closest('[data-tk-paste]'))) {
      var pid = b.getAttribute('data-tk-paste'), box = b.parentNode.querySelector('textarea'), got = parseLines(box.value);
      if (!got.items.length && got.tip == null) return T.toast('No encontré renglones: cada línea debe terminar con su importe.');
      var base = T.S.items.filter(function (i) { return i.ticket_id === pid; }).length;
      var newRows = got.items.map(function (i, n) { return { id: uuid(), ticket_id: pid, name: i.name, amount: i.amount, sort: base + n }; });
      var newClaims = [];
      got.items.forEach(function (i, n) { i.who.forEach(function (mid) { newClaims.push({ item_id: newRows[n].id, member_id: mid }); }); });
      T.S.items = T.S.items.concat(newRows); T.S.claims = T.S.claims.concat(newClaims); if (got.tip != null) find(pid).tip = got.tip;
      box.value = ''; paint();
      var res = newRows.length ? await T.sb.from('ticket_items').insert(newRows) : { error: null };
      if (!res.error && newClaims.length) res = await T.sb.from('ticket_claims').insert(newClaims);
      if (!res.error && got.tip != null) res = await T.sb.from('tickets').update({ tip: got.tip }).eq('id', pid);
      if (res.error) return failed();
      T.toast('Agregué ' + newRows.length + (newRows.length === 1 ? ' renglón' : ' renglones') + (got.tip != null ? ' y la propina.' : '.') +
        (newClaims.length ? ' Ya vienen marcados los que traían nombre.' : '') + (got.unknown.length ? ' No reconocí a: ' + got.unknown.join(', ') + '.' : ''));
    }
  });

  // Agregar un renglón a mano.
  document.addEventListener('submit', async function (e) {
    var f = e.target.closest('[data-tk-add]');
    if (!f) return;
    e.preventDefault();
    var tid = f.getAttribute('data-tk-add'), amount = Math.round(Number(f.amount.value) * 100) / 100, name = f.name.value.trim();
    if (!name || !(amount > 0)) return;
    var row = { id: uuid(), ticket_id: tid, name: name, amount: amount, sort: T.S.items.filter(function (i) { return i.ticket_id === tid; }).length };
    f.reset();
    T.S.items = T.S.items.concat([row]); paint();
    var again = document.querySelector('[data-tk-add="' + tid + '"] input[name=name]');
    if (again) again.focus();
    if ((await T.sb.from('ticket_items').insert(row)).error) failed();
  });

  // Propina y forma de pago.
  document.addEventListener('change', async function (e) {
    var i = e.target.closest('[data-tk-tip]'), s = e.target.closest('[data-tk-payer]'), t;
    if (i) {
      t = find(i.getAttribute('data-tk-tip'));
      t.tip = Math.max(0, Math.round(Number(i.value) * 100) / 100) || 0; paint();
      if ((await T.sb.from('tickets').update({ tip: t.tip }).eq('id', t.id)).error) failed();
    } else if (s) {
      t = find(s.getAttribute('data-tk-payer'));
      t.paid_by = s.value || null; paint();
      if ((await T.sb.from('tickets').update({ paid_by: t.paid_by }).eq('id', t.id)).error) failed();
    }
  });

  // Si alguien pagó todo: crea un gasto con el monto exacto de cada quien y liga la cuenta a él.
  async function closeTicket(id, btn) {
    var t = find(id), c = compute(t);
    if (c.unassigned || !c.ids.length || !t.paid_by) return;
    btn.disabled = true;
    var shares = {};
    c.ids.forEach(function (m) { shares[m] = c.total[m] / 100; });
    var ex = { id: uuid(), concept: t.title, amount: c.grand / 100, paid_by: t.paid_by, split: c.ids, shares: shares, created_by: T.me.id };
    var r = await T.sb.from('expenses').insert(ex);
    if (r.error) { btn.disabled = false; return T.toast('No se pudo pasar a gastos. Intenta de nuevo.'); }
    r = await T.sb.from('tickets').update({ expense_id: ex.id }).eq('id', id);
    if (r.error) { await T.sb.from('expenses').delete().eq('id', ex.id); return failed(); }
    t.expense_id = ex.id; paint(); T.reloadExpenses();
    T.toast('Cuenta en gastos, con lo de cada quien.');
  }

  // ── Nueva cuenta, con o sin foto ──
  $('tkPaid').innerHTML = '<option value="">Cada quien paga lo suyo</option>' + M.filter(function (m) { return m.adult; })
    .map(function (m) { return '<option value="' + m.id + '">Pagó ' + esc(m.name) + ' y se le repone</option>'; }).join('');
  $('tkAdd').addEventListener('click', function () {
    $('tkForm').reset(); T.fail($('tkErr'), ''); $('tkPaid').value = ''; $('tkGo').textContent = 'Crear cuenta';
    T.open($('dlgTk'));
  });

  // Achica la foto antes de mandarla: suficiente para leerla y mucho más ligera.
  async function toJpeg(file) {
    var bmp = await createImageBitmap(file);
    var k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    var cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85).split(',')[1];
  }
  async function readPhoto(file) {
    var image = await toJpeg(file);
    var s = (await T.sb.auth.getSession()).data.session;
    var r = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
      body: JSON.stringify({ image: image, mime: 'image/jpeg' })
    });
    if (!r.ok) throw { status: r.status };
    return r.json();
  }

  $('tkForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var file = $('tkPhoto').files && $('tkPhoto').files[0], read = null, note = '';
    T.busy(this, true); T.fail($('tkErr'), '');
    if (file) {
      $('tkGo').textContent = 'Leyendo el ticket…';
      try { read = await readPhoto(file); } catch (err) {
        note = err && err.status === 501 ? 'La lectura de tickets todavía no está activada; captura o pega los renglones.'
          : err && err.status === 422 ? 'No se alcanzó a leer el ticket; captura o pega los renglones.'
          : 'No se pudo leer la foto; captura o pega los renglones.';
      }
    }
    var t = { id: uuid(), title: $('tkTitle').value.trim(), paid_by: $('tkPaid').value || null, tip: read ? read.tip : 0, created_by: T.me.id };
    var r = await T.sb.from('tickets').insert(t);
    if (!r.error && read) {
      r = await T.sb.from('ticket_items').insert(read.items.map(function (i, n) {
        return { id: uuid(), ticket_id: t.id, name: i.name, amount: i.amount, sort: n };
      }));
    }
    T.busy(this, false); $('tkGo').textContent = 'Crear cuenta';
    if (r.error) return T.fail($('tkErr'), 'No se pudo crear la cuenta. Intenta de nuevo.');
    T.close($('dlgTk')); await reload();
    if (read) {
      var sum = read.items.reduce(function (a, i) { return a + cents(i.amount); }, 0) + cents(read.tip);
      note = read.total && Math.abs(sum - cents(read.total)) > 100
        ? 'Leí ' + read.items.length + ' renglones, pero suman ' + money(sum) + ' y el ticket dice ' + money(cents(read.total)) + '. Revísalos.'
        : 'Leí ' + read.items.length + ' renglones. Revísalos y marquen lo suyo.';
    }
    T.toast(note || 'Cuenta creada. Agrega los renglones y compártela con el grupo.');
  });
})();
