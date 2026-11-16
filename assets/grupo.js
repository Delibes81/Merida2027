// Funciones compartidas del grupo (Supabase): acceso, pendientes en vivo,
// "me apunto", vuelos y gastos. Sin conexión o sin entrar, la página sigue
// funcionando en modo de solo lectura y los pendientes se guardan en el dispositivo.
(function () {
  'use strict';

  var cfg = window.TRIP_CONFIG || {};
  // hh: con quién hace cuentas (familia, pareja o por su cuenta).
  // from/to: días que pasa con el grupo cuando no son los del viaje completo.
  var MEMBERS = [
    { id: 'liliana', name: 'Liliana', adult: true, h: 335, hh: 'dl' },
    { id: 'delibes', name: 'Delibes', adult: true, h: 20, hh: 'dl' },
    { id: 'alex', name: 'Alex', adult: false, h: 45, hh: 'dl' },
    { id: 'jorge', name: 'Jorge', adult: true, h: 170, hh: 'jz' },
    { id: 'zamy', name: 'Zamy', adult: true, h: 150, hh: 'jz' },
    { id: 'chang', name: 'Chang', adult: true, h: 200, hh: 'cs' },
    { id: 'sonia', name: 'Sonia', adult: true, h: 250, hh: 'cs' },
    { id: 'takeshi', name: 'Takeshi', adult: true, h: 280, hh: 'takeshi', arr: '2027-02-24', to: '2027-02-28',
      note: 'Llega el miércoles 24 por su cuenta y se va el domingo 28' },
    { id: 'caro', name: 'Caro', adult: true, h: 310, hh: 'caro', note: 'Llega por su cuenta y se une el jueves 25' },
    { id: 'lore', name: 'Lore', adult: true, h: 80, hh: 'lore' }
  ];
  var HH = [
    { id: 'dl', name: 'Delibes y Liliana', plural: true },
    { id: 'jz', name: 'Jorge y Zamy', plural: true },
    { id: 'cs', name: 'Chang y Sonia', plural: true },
    { id: 'takeshi', name: 'Takeshi' },
    { id: 'caro', name: 'Caro' },
    { id: 'lore', name: 'Lore' }
  ];
  var hhById = {};
  HH.forEach(function (h) { hhById[h.id] = h; });
  var byId = {};
  MEMBERS.forEach(function (m) { byId[m.id] = m; });
  var ARRIVAL = '2027-02-25', RETURN = '2027-03-02';

  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var av = function (m) { return '<span class="av" style="--h: ' + m.h + '" aria-hidden="true">' + esc(m.name[0]) + '</span>'; };
  var money = function (cents) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN',
      minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2
    }).format(cents / 100);
  };
  var fmtDate = function (d) {
    return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(d + 'T00:00:00Z')).replace(/[,.]/g, '').replace(' de ', ' ');
  };
  var PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.500 6.500l4 4"/></svg>';
  var TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>';

  var sb = null, me = null, chan = null;
  var S = { todos: {}, flights: {}, expenses: [], rsvps: [] };
  var ready = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase && window.supabase.createClient);

  // ── Avisos y diálogos ──
  var toastT;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function open(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function close(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  function fail(el, msg) { el.textContent = msg; el.hidden = !msg; }
  function busy(form, on) { all('button[type=submit]', form).forEach(function (b) { b.disabled = on; }); }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-close]')) return close(t.closest('dialog'));
    if (t.closest('[data-join]')) return openJoin();
    var v = t.closest('.vote');
    if (v && v.parentNode.hasAttribute('data-act')) return me ? toggleRsvp(v.parentNode.getAttribute('data-act')) : openJoin();
    var f = t.closest('[data-flight]');
    if (f) return openFlight(f.getAttribute('data-flight'));
    var x = t.closest('[data-del]');
    if (x) return delExpense(x.getAttribute('data-del'));
  });

  // ── Acceso ──
  $('joinWho').innerHTML = MEMBERS.map(function (m) {
    return '<label><input type="radio" name="who" value="' + m.id + '" required><span>' + av(m) + esc(m.name) + '</span></label>';
  }).join('');

  function openJoin() {
    fail($('joinErr'), ready ? '' : 'La conexión con el grupo todavía no está configurada en esta página.');
    $('joinGo').disabled = !ready;
    open($('dlgJoin'));
  }

  $('meBtn').addEventListener('click', function () {
    if (!me) return openJoin();
    $('meT').textContent = 'Hola, ' + me.name;
    open($('dlgMe'));
  });

  $('joinForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!ready) return;
    var who = (all('input[name=who]:checked', this)[0] || {}).value;
    var code = $('joinCode').value;
    fail($('joinErr'), ''); busy(this, true);
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) {
        var a = await sb.auth.signInAnonymously();
        if (a.error) throw { step: 'anon', error: a.error };
      }
      var r = await sb.rpc('join_trip', { p_code: code, p_member: who });
      if (r.error) throw { step: 'join', error: r.error };
      close($('dlgJoin')); $('joinCode').value = '';
      await enter(r.data);
      toast('Listo, ' + me.name + '. Ya estás en el grupo.');
    } catch (err) {
      var m = String((err.error && (err.error.message || err.error.code)) || err.message || '');
      var msg = 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.';
      if (/codigo_incorrecto/.test(m)) msg = 'Ese código no es. Revísalo con Delibes o Jorge.';
      else if (err.step === 'anon') msg = 'Falta activar el acceso anónimo en Supabase (Authentication → Sign In / Providers → Anonymous).';
      else if (/join_trip|PGRST202|schema cache/.test(m)) msg = 'Falta crear las tablas en Supabase: corre supabase/schema.sql en el SQL Editor.';
      fail($('joinErr'), msg);
    }
    busy(this, false);
  });

  $('leaveBtn').addEventListener('click', async function () {
    await sb.rpc('leave_trip');
    if (chan) { sb.removeChannel(chan); chan = null; }
    me = null; S = { todos: {}, flights: {}, expenses: [], rsvps: [] };
    close($('dlgMe')); paintAll();
    toast('Saliste del grupo en este dispositivo.');
  });

  async function enter(id) {
    me = byId[id] || null;
    if (!me) return;
    paintAll();
    await Promise.all(Object.keys(load).map(function (k) { return load[k](); }));
    var timers = {};
    chan = sb.channel('trip').on('postgres_changes', { event: '*', schema: 'public' }, function (p) {
      var t = p.table;
      if (!load[t]) return;
      clearTimeout(timers[t]); timers[t] = setTimeout(load[t], 150);
    }).subscribe();
  }

  var load = {
    todos: async function () {
      var r = await sb.from('todos').select('*');
      if (r.error) return;
      S.todos = {}; r.data.forEach(function (t) { S.todos[t.id] = t; }); paintTodos();
    },
    flights: async function () {
      var r = await sb.from('flights').select('*');
      if (r.error) return;
      S.flights = {}; r.data.forEach(function (f) { S.flights[f.member_id] = f; }); paintCrew();
    },
    expenses: async function () {
      var r = await sb.from('expenses').select('*').order('created_at', { ascending: false });
      if (r.error) return;
      S.expenses = r.data; paintExpenses();
    },
    rsvps: async function () {
      var r = await sb.from('rsvps').select('*');
      if (r.error) return;
      S.rsvps = r.data; paintActs();
    }
  };

  function paintAll() {
    document.body.classList.toggle('joined', !!me);
    var b = $('meBtn');
    b.classList.toggle('in', !!me);
    b.innerHTML = me ? av(me) + esc(me.name) : 'Entrar';
    paintTodos(); paintActs(); paintCrew(); paintExpenses();
  }

  // ── Pendientes ──
  var LS = 'merida2027.todo';
  var boxes = all('#todo input');
  function localTodos() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
  function paintTodos() {
    var local = me ? null : localTodos(), done = 0;
    boxes.forEach(function (cb) {
      var row = me ? S.todos[cb.id] : null;
      cb.checked = me ? !!(row && row.done) : !!local[cb.id];
      if (cb.checked) done++;
      var who = row && row.done && byId[row.done_by];
      var lab = cb.closest('label');
      if (who) lab.setAttribute('data-by', who.name); else lab.removeAttribute('data-by');
    });
    $('progBar').style.width = (100 * done / boxes.length) + '%';
    $('progTxt').textContent = done + ' de ' + boxes.length + ' listos';
    $('todoNote').hidden = !!me; $('todoSync').hidden = !me;
  }
  boxes.forEach(function (cb) {
    cb.addEventListener('change', async function () {
      if (!me) {
        var l = localTodos(); l[cb.id] = cb.checked;
        try { localStorage.setItem(LS, JSON.stringify(l)); } catch (e) {}
        return paintTodos();
      }
      var prev = S.todos[cb.id];
      S.todos[cb.id] = { id: cb.id, done: cb.checked, done_by: me.id };
      paintTodos();
      var r = await sb.from('todos').upsert({ id: cb.id, done: cb.checked, done_by: me.id, updated_at: new Date().toISOString() });
      if (r.error) { S.todos[cb.id] = prev; paintTodos(); toast('No se pudo guardar. Intenta de nuevo.'); }
    });
  });

  // ── Me apunto ──
  function paintActs() {
    all('[data-act]').forEach(function (el) {
      var id = el.getAttribute('data-act'), compact = el.tagName === 'SPAN';
      var who = S.rsvps.filter(function (r) { return r.activity === id; })
        .map(function (r) { return byId[r.member_id]; }).filter(Boolean);
      var mine = !!me && who.indexOf(me) > -1;
      var names = who.map(function (m) { return m.name; }).join(', ');
      el.innerHTML = '<button type="button" class="vote" aria-pressed="' + mine + '" title="' + esc(names || 'Me apunto') + '"' +
        (compact ? ' aria-label="Me apunto' + (who.length ? ' (' + who.length + ')' : '') + '"' : '') + '>' +
        (mine ? '✓' : '+') + (compact ? '' : ' Me apunto') + (who.length ? ' <b>' + who.length + '</b>' : '') + '</button>' +
        (!compact && who.length ? '<span class="faces" title="' + esc(names) + '">' + who.map(av).join('') + '</span>' : '');
    });
  }
  async function toggleRsvp(id) {
    var mine = S.rsvps.some(function (r) { return r.activity === id && r.member_id === me.id; });
    var before = S.rsvps, r;
    if (mine) {
      S.rsvps = before.filter(function (x) { return !(x.activity === id && x.member_id === me.id); });
      paintActs();
      r = await sb.from('rsvps').delete().eq('activity', id).eq('member_id', me.id);
    } else {
      S.rsvps = before.concat([{ activity: id, member_id: me.id }]);
      paintActs();
      r = await sb.from('rsvps').insert({ activity: id, member_id: me.id });
    }
    if (r.error) { S.rsvps = before; paintActs(); toast('No se pudo guardar. Intenta de nuevo.'); }
  }

  // ── Grupo y vuelos ──
  var crewIntro = $('crewSum').innerHTML;
  function flightLine(label, date, time, no, fallback) {
    if (!time && !no) return '';
    var parts = [label + ' ' + fmtDate(date || fallback)];
    if (time) parts.push(String(time).slice(0, 5));
    if (no) parts.push(esc(no));
    return '<span class="p-fl has">' + parts.join(' · ') + '</span>';
  }
  function paintCrew() {
    $('crew').innerHTML = HH.map(function (h) {
      var rows = MEMBERS.filter(function (m) { return m.hh === h.id; }).map(function (m) {
        var f = S.flights[m.id], lines = m.note ? '<span class="p-fl">' + esc(m.note) + '</span>' : '';
        if (me) {
          var fl = f ? flightLine('Llega', f.arr_date, f.arr_time, f.arr_flight, m.arr || ARRIVAL) + flightLine('Sale', f.dep_date, f.dep_time, f.dep_flight, m.to || RETURN) : '';
          lines += fl || '<span class="p-fl">Sin vuelo capturado</span>';
        }
        return '<div class="person' + (me === m ? ' me' : '') + '">' + av(m) +
          '<div class="p-main"><b>' + esc(m.name) + '</b>' + (me === m ? '<span class="tag">tú</span>' : '') + lines + '</div>' +
          (me ? '<button class="icon-btn" type="button" data-flight="' + m.id + '" aria-label="Editar vuelo de ' + esc(m.name) + '">' + PENCIL + '</button>' : '') +
          '</div>';
      }).join('');
      return '<li class="card hh">' + rows + '</li>';
    }).join('');
    if (!me) { $('crewSum').innerHTML = crewIntro; return; }
    var fl = MEMBERS.map(function (m) { return S.flights[m.id]; }).filter(function (f) { return f && (f.arr_time || f.arr_flight); });
    var thu = fl.filter(function (f) { return f.arr_time && (f.arr_date || ARRIVAL) === ARRIVAL; })
      .map(function (f) { return String(f.arr_time).slice(0, 5); }).sort();
    var txt = fl.length + ' de ' + MEMBERS.length + ' con vuelo de llegada capturado.';
    if (thu.length) txt += ' El jueves 25 la primera llegada es a las ' + thu[0] + (thu.length > 1 ? ' y la última a las ' + thu[thu.length - 1] : '') + '.';
    $('crewSum').textContent = txt;
  }

  $('flWho').innerHTML = MEMBERS.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
  function fillFlight(id) {
    var f = S.flights[id] || {};
    $('flArrDate').value = f.arr_date || byId[id].arr || ARRIVAL;
    $('flArrTime').value = f.arr_time ? String(f.arr_time).slice(0, 5) : '';
    $('flArrNo').value = f.arr_flight || '';
    $('flDepDate').value = f.dep_date || byId[id].to || RETURN;
    $('flDepTime').value = f.dep_time ? String(f.dep_time).slice(0, 5) : '';
    $('flDepNo').value = f.dep_flight || '';
  }
  function openFlight(id) {
    $('flWho').value = id; fillFlight(id); fail($('flErr'), '');
    open($('dlgFlight'));
  }
  $('flWho').addEventListener('change', function () { fillFlight(this.value); });
  $('flForm').addEventListener('submit', async function (e) {
    e.preventDefault(); busy(this, true);
    var row = {
      member_id: $('flWho').value,
      arr_date: $('flArrDate').value || null, arr_time: $('flArrTime').value || null, arr_flight: $('flArrNo').value.trim() || null,
      dep_date: $('flDepDate').value || null, dep_time: $('flDepTime').value || null, dep_flight: $('flDepNo').value.trim() || null,
      updated_by: me.id, updated_at: new Date().toISOString()
    };
    var r = await sb.from('flights').upsert(row);
    busy(this, false);
    if (r.error) return fail($('flErr'), 'No se pudo guardar el vuelo. Intenta de nuevo.');
    S.flights[row.member_id] = row; paintCrew();
    close($('dlgFlight')); toast('Vuelo de ' + byId[row.member_id].name + ' guardado.');
  });

  // ── Gastos ──
  // El gasto se divide por persona, pero las cuentas se hacen por familia o pareja:
  // el saldo es lo que pagó cada grupo menos las partes de su gente, en centavos.
  // Los centavos sobrantes de una división se reparten de uno en uno.
  function balances(list) {
    var bal = {};
    list.forEach(function (x) {
      var cents = Math.round(Number(x.amount) * 100);
      var split = (x.split || []).filter(function (id) { return byId[id]; });
      if (!split.length || !byId[x.paid_by]) return;
      var share = Math.floor(cents / split.length), extra = cents - share * split.length;
      var payer = byId[x.paid_by].hh;
      bal[payer] = (bal[payer] || 0) + cents;
      split.forEach(function (id, i) { var h = byId[id].hh; bal[h] = (bal[h] || 0) - share - (i < extra ? 1 : 0); });
    });
    return bal;
  }
  // Pagos mínimos: el que más debe le paga al que más le deben, y se repite.
  function settle(bal) {
    var debt = [], cred = [], out = [];
    Object.keys(bal).forEach(function (id) {
      if (bal[id] < 0) debt.push([id, -bal[id]]); else if (bal[id] > 0) cred.push([id, bal[id]]);
    });
    var desc = function (a, b) { return b[1] - a[1]; };
    while (debt.length && cred.length) {
      debt.sort(desc); cred.sort(desc);
      var pay = Math.min(debt[0][1], cred[0][1]);
      out.push({ from: debt[0][0], to: cred[0][0], cents: pay });
      debt[0][1] -= pay; cred[0][1] -= pay;
      if (!debt[0][1]) debt.shift();
      if (!cred[0][1]) cred.shift();
    }
    return out;
  }
  function paintExpenses() {
    $('exBody').hidden = !me; $('exAdd').hidden = !me;
    var total = S.expenses.reduce(function (t, x) { return t + Math.round(Number(x.amount) * 100); }, 0);
    $('exTotal').textContent = money(total);
    if (!me) return;
    $('exList').innerHTML = S.expenses.length ? S.expenses.map(function (x) {
      var p = byId[x.paid_by], n = (x.split || []).length;
      return '<li><div><b>' + esc(x.concept) + '</b><small>Pagó ' + esc(p ? p.name : '?') + ' · entre ' + n + (n === 1 ? ' persona' : ' personas') + '</small></div>' +
        '<span class="amt">' + money(Math.round(Number(x.amount) * 100)) + '</span>' +
        (x.created_by === me.id ? '<button class="icon-btn" type="button" data-del="' + esc(x.id) + '" aria-label="Borrar ' + esc(x.concept) + '">' + TRASH + '</button>' : '<span></span>') + '</li>';
    }).join('') : '<li class="empty" style="display:block">Todavía no hay gastos. El primero suele ser la camioneta.</li>';
    var bal = balances(S.expenses);
    var ids = HH.map(function (h) { return h.id; }).filter(function (id) { return bal[id]; });
    $('exBal').innerHTML = ids.length ? ids.map(function (id) {
      var c = bal[id];
      return '<li><span>' + esc(hhById[id].name) + '</span><span class="' + (c > 0 ? 'pos' : 'neg') + '">' + (c > 0 ? '+' : '−') + money(Math.abs(c)) + '</span></li>';
    }).join('') : '<li><span>Todos a mano.</span></li>';
    var pays = settle(bal);
    $('exPay').innerHTML = pays.length ? pays.map(function (p) {
      return '<li><span><b>' + esc(hhById[p.from].name) + '</b> ' + (hhById[p.from].plural ? 'le pagan' : 'le paga') + ' a <b>' + esc(hhById[p.to].name) + '</b></span><span>' + money(p.cents) + '</span></li>';
    }).join('') : '<li><span>Nadie le debe a nadie.</span></li>';
  }

  $('exPaid').innerHTML = MEMBERS.filter(function (m) { return m.adult; })
    .map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
  $('exSplit').innerHTML = MEMBERS.map(function (m) {
    return '<label><input type="checkbox" name="split" value="' + m.id + '"' + (m.adult ? ' checked' : '') + '><span>' + av(m) + esc(m.name) + '</span></label>';
  }).join('');
  // Atajos para dividir: todos los adultos, o solo quienes siguen hasta el martes.
  var adults = MEMBERS.filter(function (m) { return m.adult; });
  var staying = adults.filter(function (m) { return !m.to; });
  var early = adults.filter(function (m) { return m.to; }).map(function (m) { return m.name; });
  $('exPresets').innerHTML = '<button type="button" class="vote" data-preset="all">Los ' + adults.length + ' adultos</button>' +
    (early.length ? '<button type="button" class="vote" data-preset="stay">Sin ' + esc(early.join(' ni ')) + ' (' + staying.length + ')</button>' : '');
  $('exPresets').addEventListener('click', function (e) {
    var b = e.target.closest('[data-preset]');
    if (!b) return;
    var set = (b.getAttribute('data-preset') === 'all' ? adults : staying).map(function (m) { return m.id; });
    all('#exSplit input').forEach(function (i) { i.checked = set.indexOf(i.value) > -1; });
  });
  $('exAdd').addEventListener('click', function () {
    $('exForm').reset(); fail($('exErr'), '');
    $('exPaid').value = me.adult ? me.id : 'delibes';
    open($('dlgEx'));
  });
  $('exForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var split = all('input[name=split]:checked', this).map(function (i) { return i.value; });
    var amount = Math.round(Number($('exAmount').value) * 100) / 100;
    if (!split.length) return fail($('exErr'), 'Elige al menos una persona para dividir el gasto.');
    if (!(amount > 0)) return fail($('exErr'), 'Escribe un monto mayor a cero.');
    busy(this, true);
    var r = await sb.from('expenses').insert({ concept: $('exConcept').value.trim(), amount: amount, paid_by: $('exPaid').value, split: split, created_by: me.id });
    busy(this, false);
    if (r.error) return fail($('exErr'), 'No se pudo guardar el gasto. Intenta de nuevo.');
    close($('dlgEx')); toast('Gasto guardado.'); load.expenses();
  });
  async function delExpense(id) {
    var before = S.expenses;
    S.expenses = before.filter(function (x) { return x.id !== id; }); paintExpenses();
    var r = await sb.from('expenses').delete().eq('id', id);
    if (r.error) { S.expenses = before; paintExpenses(); toast('No se pudo borrar. Intenta de nuevo.'); }
    else toast('Gasto borrado.');
  }

  // ── Arranque ──
  paintAll();
  if (ready) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    sb.auth.getSession().then(function (r) {
      if (!r.data || !r.data.session) return;
      return sb.rpc('my_member').then(function (m) { if (m.data) return enter(m.data); });
    }).catch(function () {});
  }
})();
