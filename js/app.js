/* UB Grid Monitor — map, substation views and switching UI. */
(function () {
  'use strict';

  var KV = [220, 110, 35, 10, 0.4];
  var COLOR = { 220: '#c084fc', 110: '#fbbf24', 35: '#38bdf8', 10: '#4ade80', 0.4: '#e2e8f0' };
  var DEAD = '#64748b', FAULT = '#f87171', BG = '#0b1220';
  var MINZ = { 220: 0, 110: 0, 35: 13, 10: 14, 0.4: 16 };
  var KVNOTE = { 220: 'transmission', 110: 'transmission', 35: 'zoom 13+', 10: 'zoom 14+', 0.4: 'zoom 16+' };
  var YARD_Z = 16;

  var net = Grid.build();
  var layerOn = { 220: true, 110: true, 35: true, 10: true, 0.4: true };
  var current = null;      // open station id
  var selected = null;     // selected switch id in the panel
  var events = [];
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ================= map ================= */

  var map = L.map('map', { zoomControl: false, minZoom: 10, maxZoom: 20, zoomSnap: 1 }).setView([47.915, 106.885], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a> · demo data, not the real network');

  map.createPane('fallback').style.zIndex = 150;
  map.createPane('yardbg').style.zIndex = 390;
  map.createPane('yard').style.zIndex = 430;
  map.createPane('labels').style.zIndex = 620;
  map.getPane('labels').style.pointerEvents = 'none';
  map.getPane('fallback').style.pointerEvents = 'none';

  var BASEMAPS = {
    dark: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 20, maxNativeZoom: 19, className: 'dark-tiles', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }),
    streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 20, maxNativeZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }),
    sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, maxNativeZoom: 18, attribution: 'Imagery © Esri and its data providers' })
  };
  var base = null, tilesOk = false, tileErr = 0, fbNote = null;
  function setBase(k) {
    if (base) map.removeLayer(base);
    base = BASEMAPS[k].addTo(map);
  }
  Object.keys(BASEMAPS).forEach(function (k) {
    BASEMAPS[k].on('tileload', function () { tilesOk = true; if (fbNote) { map.removeControl(fbNote); fbNote = null; } });
    BASEMAPS[k].on('tileerror', function () {
      if (tilesOk || fbNote || ++tileErr < 4) return;
      fbNote = L.control({ position: 'topleft' });
      fbNote.onAdd = function () { return el('div', 'fb-note', 'Basemap tiles unreachable — showing built-in schematic of the city'); };
      fbNote.addTo(map);
    });
  });
  setBase('dark');
  $('basemap').addEventListener('change', function () { setBase(this.value); });

  /* Rough hand-drawn backdrop, only visible when the tile server cannot be reached. */
  (function fallback() {
    var g = L.layerGroup().addTo(map), o = { pane: 'fallback', interactive: false };
    var tuul = [[47.912, 107.12], [47.905, 107.05], [47.899, 106.99], [47.895, 106.95], [47.894, 106.92], [47.890, 106.88], [47.884, 106.84], [47.878, 106.80], [47.872, 106.76], [47.868, 106.70], [47.860, 106.64]];
    var selbe = [[47.985, 106.930], [47.945, 106.9255], [47.920, 106.928], [47.905, 106.925], [47.894, 106.92]];
    L.polyline(tuul, Object.assign({ color: '#16304d', weight: 7 }, o)).addTo(g);
    L.polyline(selbe, Object.assign({ color: '#16304d', weight: 3 }, o)).addTo(g);
    [[[47.915, 106.70], [47.9165, 106.85], [47.9155, 106.917], [47.917, 106.96], [47.918, 107.08]],
     [[47.886, 106.917], [47.985, 106.914]], [[47.875, 106.76], [47.898, 106.83], [47.9065, 106.905], [47.9065, 106.99]],
     [[47.935, 106.76], [47.932, 106.86], [47.9285, 106.93], [47.930, 107.04]],
     [[47.960, 106.825], [47.905, 106.835]], [[47.940, 106.975], [47.900, 106.972]]
    ].forEach(function (r) { L.polyline(r, Object.assign({ color: '#1b2638', weight: 3 }, o)).addTo(g); });
    L.polygon([[47.862, 106.70], [47.866, 106.80], [47.866, 106.90], [47.874, 107.00], [47.88, 107.10], [47.80, 107.10], [47.80, 106.70]],
      Object.assign({ stroke: false, fillColor: '#0e1a1c', fillOpacity: 1 }, o)).addTo(g);
    [['Songinokhairkhan', 47.925, 106.765], ['Bayangol', 47.912, 106.848], ['Sükhbaatar', 47.9305, 106.918], ['Chingeltei', 47.9405, 106.872],
     ['Bayanzürkh', 47.927, 106.99], ['Khan-Uul', 47.878, 106.885], ['Bogd Khan Uul', 47.845, 106.93], ['Tuul River', 47.8885, 106.985, 'water']
    ].forEach(function (l) {
      L.marker([l[1], l[2]], { pane: 'fallback', interactive: false, icon: L.divIcon({ className: 'fb-label ' + (l[3] || ''), html: l[0], iconSize: [180, 16] }) }).addTo(g);
    });
  })();

  var gYardBg = L.layerGroup().addTo(map), gLines = L.layerGroup().addTo(map),
      gYard = L.layerGroup().addTo(map), gMarks = L.layerGroup().addTo(map);

  function inView(bb, b) {
    return !(bb[2] < b.getSouth() || bb[0] > b.getNorth() || bb[3] < b.getWest() || bb[1] > b.getEast());
  }
  function midpoint(path) {
    var tot = 0, d = [], i;
    for (i = 1; i < path.length; i++) { d.push(Grid.distM(path[i - 1], path[i])); tot += d[i - 1]; }
    var h = tot / 2;
    for (i = 0; i < d.length; i++) {
      if (h <= d[i]) { var t = d[i] ? h / d[i] : 0; return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t]; }
      h -= d[i];
    }
    return path[0];
  }
  function label(pos, text, cls, anchor) {
    return L.marker(pos, { pane: 'labels', interactive: false,
      icon: L.divIcon({ className: 'maplabel ' + (cls || ''), html: esc(text), iconSize: [160, 14], iconAnchor: anchor || [80, 7] }) });
  }

  function drawLine(l, z) {
    var st = net.lineStatus(l), col = st === 'live' ? COLOR[l.kv] : st === 'fault' ? FAULT : DEAD;
    var w = ({ 220: 4, 110: 3.2, 35: 2.6, 10: 2.2, 0.4: 1.4 })[l.kv] + (z >= 15 ? 1 : 0) + (z >= 17 ? 0.8 : 0);
    var hit = L.polyline(l.path, { color: BG, weight: w + (l.kv < 1 ? 9 : 6), opacity: l.kv < 1 ? 0.01 : 0.6, className: 'hit', lineJoin: 'round' }).addTo(gLines);
    hit.on('click', function (e) { L.DomEvent.stopPropagation(e); linePopup(l, e.latlng); });
    hit.bindTooltip(l.name, { sticky: true, opacity: 0.95 });
    L.polyline(l.path, { color: col, weight: w, interactive: false, lineJoin: 'round',
      dashArray: st === 'dead' ? '5 7' : st === 'fault' ? '11 7' : null, opacity: st === 'dead' ? 0.9 : 1 }).addTo(gLines);
    var dir = net.lineDir(l);
    if (st === 'live' && dir && l.kv >= 10 && (l.kv > 10 || z >= 15)) {
      L.polyline(l.path, { color: '#fff', weight: Math.max(1.2, w - 2), opacity: 0.75, dashArray: '2 14', lineCap: 'round',
        interactive: false, className: 'flow' + (dir < 0 ? ' rev' : '') }).addTo(gLines);
    }
    if (l.fault) {
      L.marker(midpoint(l.path), { pane: 'labels', interactive: false, icon: L.divIcon({ className: '', html: '<div class="faultm">✕</div>', iconSize: [20, 20] }) }).addTo(gMarks);
    }
  }

  var ICON_PLANT = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 21V11l5 3v-3l5 3V4h3l1 17z" fill="currentColor"/><path d="M19 9c1-2 3-1 3-4" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>';
  var ICON_SS = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M13 2 5 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>';

  function drawStationMarker(st, z) {
    var top = st.buses[0], small = top < 110 || (st.kind === 'ss' && z < 12);
    var showName = st.kind !== 'ss' || z >= 12;
    var status = net.stationStatus(st), size = st.kind === 'plant' ? 34 : small ? 14 : 22;
    var html = '<div class="stm ' + st.kind + (small ? ' small ' : ' ') + status + '" style="--c:' + COLOR[top] + '">' +
      '<div class="ico">' + (st.kind === 'plant' ? ICON_PLANT : ICON_SS) + '</div>' + (showName ? '<div class="nm">' + esc(st.name) + '</div>' : '') + '</div>';
    L.marker(st.pos, { icon: L.divIcon({ className: '', html: html, iconSize: [140, size + 18], iconAnchor: [70, size / 2] }), keyboard: true, title: st.title, riseOnHover: true })
      .on('click', function () { openStation(st.id); }).addTo(gMarks);
  }

  function drawYard(st, z) {
    L.polygon(st.yard, { pane: 'yardbg', color: '#52607a', weight: 1.5, dashArray: '6 4', fillColor: '#0d1524', fillOpacity: 0.88 })
      .on('click', function () { openStation(st.id); }).addTo(gYardBg);
    var k = z - 15, ti = 0, o = { pane: 'yard', interactive: false, lineCap: 'butt' };
    var nc = function (node, kv) { return net.live[node] ? COLOR[kv] : DEAD; };
    st.prims.forEach(function (p) {
      if (p.t === 'bus') {
        L.polyline([st.geo(p.x0, p.y), st.geo(p.x1, p.y)], Object.assign({}, o, { color: nc(p.node, p.kv), weight: 2 + k * 1.6, lineCap: 'round' })).addTo(gYard);
        if (z >= 18) label(st.geo(p.x0 + 0.1, p.y + 0.3), p.kv + ' kV' + (p.tag ? ' · ' + p.tag : ''), 'dim', [0, 7]).addTo(gYard);
      } else if (p.t === 'wire') {
        L.polyline(p.pts.map(function (q) { return st.geo(q[0], q[1]); }), Object.assign({}, o, { color: nc(p.node, p.kv), weight: 1 + k * 0.7 })).addTo(gYard);
      } else if (p.t === 'sw') {
        var s = net.switches[p.sw], h = 0.25, abn = s.closed !== s.normal;
        var c = s.closed ? (net.switchLive(s) ? COLOR[p.kv] : DEAD) : '#e2e8f0';
        L.rectangle([st.geo(p.x - h, p.y - h), st.geo(p.x + h, p.y + h)], { pane: 'yard', color: abn ? '#fb923c' : c, weight: abn ? 3 : 1.5,
          fillColor: s.closed ? c : BG, fillOpacity: 1, className: 'hit' })
          .bindTooltip(s.name + ' — ' + (s.closed ? 'CLOSED' : 'OPEN'), { sticky: true })
          .on('click', function (e) { L.DomEvent.stopPropagation(e); openStation(st.id, p.sw); }).addTo(gYard);
      } else if (p.t === 'xf') {
        [[p.y + 0.2, p.nodeH, p.kvH], [p.y - 0.2, p.nodeL, p.kvL]].forEach(function (c) {
          L.circle(st.geo(p.x, c[0]), { pane: 'yard', radius: 0.32 * Grid.U, color: nc(c[1], c[2]), weight: 1 + k * 0.6, fillColor: BG, fillOpacity: 0.6, interactive: false }).addTo(gYard);
        });
        if (z >= 18) label(st.geo(p.x + 0.45, p.y), p.label + ' · ' + p.mva + ' MVA', 'dim', [0, 7]).addTo(gYard);
      } else if (p.t === 'gen') {
        L.circle(st.geo(p.x, p.y), { pane: 'yard', radius: 0.4 * Grid.U, color: COLOR[p.kv], weight: 1 + k * 0.6, fillColor: '#1f2937', fillOpacity: 1, interactive: false }).addTo(gYard);
        if (z >= 17) label(st.geo(p.x, p.y), z >= 18 ? p.label : 'G', 'c').addTo(gYard);
      } else if (p.t === 'term' && z >= 18) {
        var up = p.dir === 'up', lift = up && z < 20 ? (ti++ % 3) * 0.42 : 0;
        label(st.geo(p.x, p.y + (up ? 0.3 + lift : -0.35)), up ? '→ ' + p.label : p.label, 'dim c').addTo(gYard);
      }
    });
    label(st.geo((st.bbox.x0 + st.bbox.x1) / 2, st.bbox.y1 + (z >= 18 ? 3.1 : 1.9)), st.title, 'c').addTo(gYard);
  }

  function render() {
    var z = map.getZoom(), b = map.getBounds().pad(0.1);
    gYardBg.clearLayers(); gLines.clearLayers(); gYard.clearLayers(); gMarks.clearLayers();

    // draw high voltage last so it sits on top
    KV.slice().reverse().forEach(function (kv) {
      if (!layerOn[kv] || z < MINZ[kv]) return;
      net.lineList.forEach(function (l) { if (l.kv === kv && inView(l.bb, b)) drawLine(l, z); });
    });

    net.stationList.forEach(function (st) {
      if (st.buses[0] < 110 && st.kind === 'ss' && z < 13) return;
      if (z >= YARD_Z) { if (b.contains(st.pos)) drawYard(st, z); }
      else drawStationMarker(st, z);
    });

    if (layerOn[10] && z >= MINZ[10]) {
      net.tpList.forEach(function (tp) {
        if (!b.contains(tp.pos)) return;
        var live = net.live[tp.mv], s = net.switches[tp.sw], m;
        if (z < 16) {
          m = L.circleMarker(tp.pos, { radius: z - 11, color: BG, weight: 1, fillColor: live ? COLOR[10] : DEAD, fillOpacity: 1 });
        } else {
          m = L.marker(tp.pos, { icon: L.divIcon({ className: '', iconSize: [14, 14],
            html: '<div class="tpm' + (live ? '' : ' dead') + (s.closed ? '' : ' swopen') + '">' + (z >= 17 ? '<span>' + tp.id + ' · ' + tp.kva + ' kVA</span>' : '') + '</div>' }) });
        }
        m.bindTooltip(tp.id + ' · 10/0.4 kV · ' + tp.kva + ' kVA').on('click', function (e) { L.DomEvent.stopPropagation(e); tpPopup(tp); }).addTo(gMarks);
      });
      net.ties.forEach(function (t) {
        if (!b.contains(t.pos)) return;
        var s = net.switches[t.id];
        L.marker(t.pos, { icon: L.divIcon({ className: '', iconSize: [14, 14], html: '<div class="tiem' + (s.closed ? ' closed' : '') + '"></div>' }), zIndexOffset: 500 })
          .bindTooltip(s.name + ' — ' + (s.closed ? 'CLOSED' : 'OPEN (normal)'))
          .on('click', function (e) { L.DomEvent.stopPropagation(e); switchPopup(s, t.pos); }).addTo(gMarks);
      });
    }

    if (layerOn[0.4] && z >= MINZ[0.4]) {
      net.consumerList.forEach(function (c) {
        if (!b.contains(c.pos)) return;
        var live = net.live[c.node];
        L.circleMarker(c.pos, { radius: z >= 18 ? 7 : z >= 17 ? 5.5 : 4, color: c.critical ? '#f472b6' : BG, weight: c.critical ? 2.5 : 1,
          fillColor: live ? '#fde68a' : '#3b4558', fillOpacity: 1 })
          .bindTooltip(c.name + (c.critical ? ' · CRITICAL' : '') + ' — ' + (live ? 'supplied' : 'NO SUPPLY'))
          .on('click', function (e) { L.DomEvent.stopPropagation(e); consumerPopup(c); }).addTo(gMarks);
      });
    }
    renderLevels(z);
  }
  map.on('moveend zoomend', render);

  /* ================= popups ================= */

  function popup(latlng, title, rows, extra) {
    var d = el('div', 'pop');
    d.appendChild(el('h4', null, title));
    var dl = el('dl');
    rows.forEach(function (r) {
      dl.appendChild(el('dt', null, r[0]));
      var dd = el('dd'); if (r[1] instanceof Node) dd.appendChild(r[1]); else dd.textContent = r[1]; dl.appendChild(dd);
    });
    d.appendChild(dl);
    (extra || []).forEach(function (x) { d.appendChild(x); });
    L.popup({ maxWidth: 300 }).setLatLng(latlng).setContent(d).openOn(map);
  }
  function badge(state, text) { return el('span', 'badge ' + state, text || { live: 'LIVE', dead: 'DE-ENERGISED', fault: 'FAULT', partial: 'PARTIAL' }[state]); }
  function button(text, cls, fn) { var b = el('button', 'btn small ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function impactText(p) {
    if (p.lost) return '⚠ ' + fmt(p.lost) + ' customers will lose supply' + (p.criticalOff > 0 ? ', incl. ' + p.criticalOff + ' critical site(s)' : '') + '.';
    if (p.restored) return '✓ Restores supply to ' + fmt(p.restored) + ' customers.';
    return 'No customers affected.';
  }

  function linePopup(l, latlng) {
    var st = net.lineStatus(l), rows = [['Voltage', l.kv + ' kV'], ['Status', badge(st)]];
    if (l.a) rows.push(['Between', net.stations[l.a].name + ' ↔ ' + net.stations[l.b].name]);
    if (l.feeder) { var fd = net.feeders[l.feeder]; rows.push(['Feeder', net.stations[fd.station].name + ' ' + fd.name]); }
    if (l.tp) rows.push(['Fed from', l.tp]);
    var p = net.preview(function () { l.fault = !l.fault; }, function () { l.fault = !l.fault; });
    var extra = [el('p', 'impact', impactText(p))];
    extra.push(l.fault ? button('Mark repaired', 'go', function () { setFault(l, false); })
                       : button('Simulate cable fault / cut', 'danger', function () { setFault(l, true); }));
    if (l.feeder) extra.push(document.createTextNode(' '), button('Open source substation', 'ghost', function () { map.closePopup(); openStation(net.feeders[l.feeder].station, net.feeders[l.feeder].sw); }));
    popup(latlng, l.name, rows, extra);
  }

  function switchPopup(s, latlng, title, rows) {
    var p = net.preview(function () { s.closed = !s.closed; }, function () { s.closed = !s.closed; });
    popup(latlng, title || s.name, (rows || []).concat([
      ['Position', badge(s.closed ? 'live' : 'open', s.closed ? 'CLOSED' : 'OPEN')],
      ['Normal', s.normal ? 'Closed' : 'Open']
    ]), [el('p', 'impact', impactText(p)), button(s.closed ? 'Open switch' : 'Close switch', s.closed ? 'danger' : 'go', function () { operate(s.id); })]);
  }
  function tpPopup(tp) {
    var fd = net.feeders[tp.feeder], cust = 0;
    tp.consumers.forEach(function (c) { cust += net.consumers[c].customers; });
    switchPopup(net.switches[tp.sw], tp.pos, tp.id + ' · transformer point', [
      ['Rating', '10 / 0.4 kV · ' + tp.kva + ' kVA'],
      ['Feeder', net.stations[fd.station].name + ' ' + fd.name],
      ['10 kV side', badge(net.live[tp.mv] ? 'live' : 'dead')],
      ['Customers', fmt(cust) + ' on ' + tp.consumers.length + ' service cables']
    ]);
  }
  function consumerPopup(c) {
    popup(c.pos, c.name, [['Type', c.label + (c.critical ? ' (critical)' : '')], ['Supply', badge(net.live[c.node] ? 'live' : 'dead', net.live[c.node] ? 'SUPPLIED' : 'NO SUPPLY')],
      ['Metered customers', fmt(c.customers)], ['Connected load', c.kw + ' kW'], ['Fed from', c.tp]]);
  }

  /* ================= actions ================= */

  function log(type, text) {
    events.unshift({ t: new Date(), type: type, text: text });
    if (events.length > 60) events.pop();
  }
  var toastTimer;
  function toast(text, cls) {
    var t = $('toast'); t.textContent = text; t.className = cls || ''; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }
  function delta(before) {
    var d = net.stats().custOn - before;
    return d < 0 ? fmt(-d) + ' customers de-energised' : d > 0 ? fmt(d) + ' customers restored' : 'no customers affected';
  }
  function operate(id) {
    var s = net.switches[id], before = net.stats().custOn;
    s.closed = !s.closed; net.compute();
    var where = s.station ? net.stations[s.station].name + ' · ' : '';
    var msg = where + s.name + ' ' + (s.closed ? 'CLOSED' : 'OPENED') + ' — ' + delta(before);
    log(s.closed ? 'close' : 'open', msg);
    toast(msg, net.stats().custOn < before ? 'bad' : 'good');
    map.closePopup(); refresh();
  }
  function setFault(l, on) {
    var before = net.stats().custOn;
    l.fault = on; net.compute();
    var msg = l.name + (on ? ' — FAULT, section isolated; ' : ' — repaired and returned to service; ') + delta(before);
    log(on ? 'fault' : 'repair', msg);
    toast(msg, on ? 'bad' : 'good');
    map.closePopup(); refresh();
  }
  function refresh() { render(); renderSide(); renderPanel(); }

  /* ================= sidebar & top bar ================= */

  var loadFactor = 0.62;
  function renderKpis() {
    var s = net.stats();
    $('kLoad').textContent = (s.kwOn * loadFactor / 1000).toFixed(1) + ' MW';
    $('kOn').textContent = fmt(s.custOn);
    $('kOff').textContent = fmt(s.cust - s.custOn);
    $('kFault').textContent = s.faults;
    $('kAbn').textContent = s.abnormal.length;
    $('kOffBox').className = 'kpi' + (s.cust - s.custOn ? ' bad' : '');
    $('kFaultBox').className = 'kpi' + (s.faults ? ' bad' : '');
    $('kAbnBox').className = 'kpi' + (s.abnormal.length ? ' warn' : '');
    var alert = s.faults || s.cust - s.custOn;
    $('sysState').textContent = alert ? 'ALERT' : 'NORMAL';
    $('sysState').className = 'pill ' + (alert ? 'alert' : 'ok');
  }

  function renderLevels(z) {
    $('zoomVal').textContent = 'zoom ' + z;
    var lvl = z >= 16 ? 3 : z >= 14 ? 2 : z >= 13 ? 1 : 0;
    Array.prototype.forEach.call($('levels').children, function (li, i) {
      li.className = (i <= lvl ? 'on' : '') + (i === lvl ? ' cur' : '');
    });
  }
  Array.prototype.forEach.call($('levels').children, function (li) {
    li.addEventListener('click', function () { map.setZoom(+li.dataset.z); });
  });

  (function layersUi() {
    KV.forEach(function (kv) {
      var lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
      cb.addEventListener('change', function () { layerOn[kv] = cb.checked; render(); });
      var sw = el('span', 'sw'); sw.style.background = COLOR[kv];
      lab.appendChild(cb); lab.appendChild(sw); lab.appendChild(document.createTextNode(kv + ' kV')); lab.appendChild(el('em', null, KVNOTE[kv]));
      $('layers').appendChild(lab);
    });
  })();

  function renderSide() {
    renderKpis();
    var box = $('stationList'); box.textContent = '';
    [['Power plants & grid tie', function (s) { return s.kind !== 'ss'; }],
     ['220 kV substations', function (s) { return s.kind === 'ss' && s.buses[0] === 220; }],
     ['110 kV substations', function (s) { return s.kind === 'ss' && s.buses[0] === 110; }],
     ['35 kV substations', function (s) { return s.kind === 'ss' && s.buses[0] === 35; }]
    ].forEach(function (g) {
      box.appendChild(el('h3', null, g[0]));
      net.stationList.filter(g[1]).forEach(function (st) {
        var b = el('button', 'st-row' + (st.id === current ? ' sel' : '')); b.type = 'button';
        b.appendChild(el('span', 'dot ' + net.stationStatus(st)));
        b.appendChild(el('span', null, st.name));
        var info = st.buses.join('/') + ' kV';
        if (st.gens.length) { var mw = 0; st.gens.forEach(function (x) { if (net.switches[x.sw].closed) mw += x.mw; }); info = mw + ' MW online'; }
        else if (st.feeders.length) { var on = st.feeders.filter(function (f) { return net.live[net.feeders[f].head]; }).length; info = on + '/' + st.feeders.length + ' feeders'; }
        b.appendChild(el('em', null, info));
        b.addEventListener('click', function () { goStation(st.id); $('side').classList.remove('open'); });
        box.appendChild(b);
      });
    });
    var ul = $('log'); ul.textContent = '';
    events.forEach(function (e) {
      var li = el('li', e.type);
      li.appendChild(el('time', null, e.t.toLocaleTimeString('en-GB', { timeZone: 'Asia/Ulaanbaatar' })));
      li.appendChild(document.createTextNode(e.text));
      ul.appendChild(li);
    });
  }

  /* ================= station panel ================= */

  function flyClear(pos, z) {
    var size = map.getSize(), wide = window.innerWidth > 820;
    var shift = wide ? [Math.min(540, size.x * 0.6) / 2, 0] : [0, size.y * 0.3];
    map.flyTo(map.unproject(map.project(pos, z).add(shift), z), z, { duration: 0.9 });
  }
  function goStation(id) {
    openStation(id);
    flyClear(net.stations[id].pos, Math.max(map.getZoom(), 17));
  }
  function openStation(id, sw) {
    if (current !== id) selected = null;
    current = id; if (sw) selected = sw;
    renderPanel(); renderSide();
  }
  function closePanel() { current = null; selected = null; $('panel').hidden = true; renderSide(); }

  function sld(st) {
    var S = 46, pad = { l: 64, r: st.buses.length === 3 ? 60 : 30, t: 92, b: st.gens.length ? 62 : 44 }, bb = st.bbox;
    var W = (bb.x1 - bb.x0) * S + pad.l + pad.r, H = (bb.y1 - bb.y0) * S + pad.t + pad.b;
    var X = function (x) { return ((x - bb.x0) * S + pad.l).toFixed(1); }, Y = function (y) { return ((bb.y1 - y) * S + pad.t).toFixed(1); };
    var nc = function (node, kv) { return net.live[node] ? COLOR[kv] : DEAD; };
    var o = ['<svg class="sld" viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" role="img" aria-label="Single-line diagram of ' + esc(st.title) + '">'];
    var top = [];
    st.prims.forEach(function (p) {
      if (p.t === 'bus') {
        o.push('<line x1="' + X(p.x0) + '" y1="' + Y(p.y) + '" x2="' + X(p.x1) + '" y2="' + Y(p.y) + '" stroke="' + nc(p.node, p.kv) + '" stroke-width="7" stroke-linecap="round"' + (net.live[p.node] ? '' : ' stroke-dasharray="1 0" opacity=".8"') + '/>');
        var t = p.kv + ' kV' + (p.tag ? ' · ' + p.tag : '');
        if (p.lab === 'right') o.push('<text class="kv" x="' + (+X(p.x1) + 9) + '" y="' + (+Y(p.y) + 4) + '" style="fill:' + COLOR[p.kv] + '">' + t + '</text>');
        else o.push(p.lab === 'side' ? '<text class="kv" text-anchor="end" x="' + (X(p.x0) - 9) + '" y="' + (+Y(p.y) + 4) + '" fill="' + COLOR[p.kv] + '" style="fill:' + COLOR[p.kv] + '">' + t + '</text>'
                                : '<text class="kv" x="' + (+X(p.x0) + 2) + '" y="' + (Y(p.y) - 9) + '" style="fill:' + COLOR[p.kv] + '">' + t + '</text>');
      } else if (p.t === 'wire') {
        o.push('<polyline fill="none" stroke-width="2.5" stroke="' + nc(p.node, p.kv) + '"' + (net.live[p.node] ? '' : ' stroke-dasharray="4 4"') + ' points="' + p.pts.map(function (q) { return X(q[0]) + ',' + Y(q[1]); }).join(' ') + '"/>');
      } else if (p.t === 'sw') {
        var s = net.switches[p.sw], c = s.closed ? (net.switchLive(s) ? COLOR[p.kv] : DEAD) : '#e2e8f0';
        top.push('<g class="sw ' + (s.closed ? 'closed' : 'open') + (s.closed !== s.normal ? ' abn' : '') + (p.sw === selected ? ' sel' : '') + '" data-sw="' + p.sw + '" tabindex="0" role="button" aria-label="' + esc(s.name) + ', ' + (s.closed ? 'closed' : 'open') + '" transform="translate(' + X(p.x) + ',' + Y(p.y) + ')">' +
          '<title>' + esc(s.name) + ' — ' + (s.closed ? 'CLOSED' : 'OPEN') + '</title><rect class="hitbox" x="-17" y="-17" width="34" height="34"/><rect class="ring" x="-15" y="-15" width="30" height="30" rx="4"/>' +
          '<rect class="box" x="-10" y="-10" width="20" height="20" rx="2.5" fill="' + (s.closed ? c : BG) + '" stroke="' + c + '" stroke-width="2"/>' +
          (s.closed ? '' : '<line x1="-5" y1="5" x2="5" y2="-5" stroke="#e2e8f0" stroke-width="2"/>') + '</g>');
      } else if (p.t === 'xf') {
        o.push('<circle cx="' + X(p.x) + '" cy="' + (Y(p.y) - 8) + '" r="12" fill="' + BG + '" stroke="' + nc(p.nodeH, p.kvH) + '" stroke-width="2.5"/>');
        o.push('<circle cx="' + X(p.x) + '" cy="' + (+Y(p.y) + 8) + '" r="12" fill="none" stroke="' + nc(p.nodeL, p.kvL) + '" stroke-width="2.5"/>');
        var lx = +X(p.x) + (p.left ? -17 : 17), an = p.left ? ' text-anchor="end"' : '';
        o.push('<text' + an + ' x="' + lx + '" y="' + (Y(p.y) - 1) + '">' + p.label + '</text><text class="small"' + an + ' x="' + lx + '" y="' + (+Y(p.y) + 11) + '">' + p.mva + ' MVA</text>');
      } else if (p.t === 'gen') {
        var on = net.switches[p.sw].closed;
        o.push('<circle cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="16" fill="#1f2937" stroke="' + (on ? COLOR[p.kv] : DEAD) + '" stroke-width="2.5"/><text text-anchor="middle" x="' + X(p.x) + '" y="' + (+Y(p.y) + 4) + '" style="font-weight:700">G</text>');
        o.push('<text text-anchor="middle" x="' + X(p.x) + '" y="' + (+Y(p.y) + 32) + '">' + esc(p.label) + '</text><text class="small" text-anchor="middle" x="' + X(p.x) + '" y="' + (+Y(p.y) + 44) + '">' + p.mw + ' MW</text>');
      } else if (p.t === 'term') {
        var x = +X(p.x), y = +Y(p.y);
        if (p.dir === 'up') {
          var l = net.lines[p.line], ls = net.lineStatus(l), lc = ls === 'live' ? COLOR[p.kv] : ls === 'fault' ? FAULT : DEAD;
          o.push('<path d="M' + (x - 5) + ' ' + (y + 2) + 'L' + x + ' ' + (y - 7) + 'L' + (x + 5) + ' ' + (y + 2) + 'z" fill="' + lc + '"/>');
          o.push('<text class="lnk" data-st="' + p.other + '" tabindex="0" role="link" transform="translate(' + (x + 3) + ',' + (y - 13) + ') rotate(-52)">' + (ls === 'fault' ? '✕ ' : '') + esc(p.label) + '</text>');
        } else {
          var fs = net.feederStats(net.feeders[p.feeder]), col = net.live[p.node] ? COLOR[p.kv] : DEAD;
          o.push('<path d="M' + (x - 5) + ' ' + (y - 2) + 'L' + x + ' ' + (y + 7) + 'L' + (x + 5) + ' ' + (y - 2) + 'z" fill="' + col + '"/>');
          o.push('<text text-anchor="middle" x="' + x + '" y="' + (y + 22) + '">' + p.label + '</text><text class="small" text-anchor="middle" x="' + x + '" y="' + (y + 34) + '">' + fs.tpsOn + '/' + fs.tps + ' TP</text>');
        }
      }
    });
    return o.concat(top).join('') + '</svg>';
  }

  function renderPanel() {
    var panel = $('panel');
    if (!current) { panel.hidden = true; return; }
    var st = net.stations[current], status = net.stationStatus(st), keep = panel.scrollTop;
    panel.hidden = false; panel.textContent = '';

    var head = el('div', 'p-head'), row = el('div', 'row'), tw = el('div');
    tw.appendChild(el('h3', null, st.title));
    var sub = el('p'); sub.appendChild(badge(status)); sub.appendChild(document.createTextNode('  ' + (st.sub || (st.kind === 'ss' ? 'Substation' : ''))));
    tw.appendChild(sub); row.appendChild(tw);
    var acts = el('div', 'acts');
    acts.appendChild(button('Show yard on map', 'ghost', function () { flyClear(st.pos, 18); }));
    var x = button('✕', 'ghost', closePanel); x.setAttribute('aria-label', 'Close panel'); acts.appendChild(x);
    row.appendChild(acts); head.appendChild(row); panel.appendChild(head);

    var body = el('div', 'p-body'); panel.appendChild(body);
    var h = el('h4', null, 'Single-line diagram'); h.style.marginTop = '0'; body.appendChild(h);
    var wrap = el('div', 'sld-wrap'); wrap.innerHTML = sld(st); body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      var g = e.target.closest('[data-sw]'), ln = e.target.closest('[data-st]');
      if (g) { selected = g.dataset.sw; renderPanel(); }
      else if (ln) goStation(ln.dataset.st);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var g = e.target.closest('[data-sw]'), ln = e.target.closest('[data-st]');
      if (g) { e.preventDefault(); selected = g.dataset.sw; renderPanel(); }
      else if (ln) { e.preventDefault(); goStation(ln.dataset.st); }
    });

    if (selected && net.switches[selected] && net.switches[selected].station === st.id) {
      var s = net.switches[selected];
      var p = net.preview(function () { s.closed = !s.closed; }, function () { s.closed = !s.closed; });
      var ctl = el('div', 'ctl'), r = el('div', 'row');
      r.appendChild(el('b', null, s.name)); r.appendChild(badge(s.closed ? 'live' : 'open', s.closed ? 'CLOSED' : 'OPEN'));
      if (s.closed !== s.normal) r.appendChild(el('span', 'badge partial', 'ABNORMAL'));
      ctl.appendChild(r);
      ctl.appendChild(el('p', 'impact ' + (p.lost ? 'bad' : p.restored ? 'good' : ''), 'If you ' + (s.closed ? 'open' : 'close') + ' it: ' + impactText(p)));
      var a = el('div', 'acts');
      a.appendChild(button(s.closed ? 'Open breaker' : 'Close breaker', s.closed ? 'danger' : 'go', function () { operate(s.id); }));
      a.appendChild(button('Cancel', 'ghost', function () { selected = null; renderPanel(); }));
      ctl.appendChild(a); body.appendChild(ctl);
    } else {
      body.appendChild(el('p', 'hint', 'Select a switch (square) to see what it feeds, then open or close it. Click a line name to jump to the far-end station.'));
    }

    var tb, tr;
    function table(cols) {
      var t = el('table', 'ft'), hr = el('tr');
      cols.forEach(function (c) { hr.appendChild(el('th', c[1] || '', c[0])); });
      t.appendChild(hr); body.appendChild(t); return t;
    }
    if (st.feeders.length) {
      body.appendChild(el('h4', null, '10 kV feeders'));
      tb = table([['Feeder'], ['Bus'], ['State'], ['TPs live', 'num'], ['Customers on', 'num'], ['']]);
      st.feeders.forEach(function (fid) {
        var fd = net.feeders[fid], fs = net.feederStats(fd), sw = net.switches[fd.sw];
        var state = !sw.closed ? ['open', 'BREAKER OPEN'] : !net.live[fd.head] ? ['dead', 'DE-ENERGISED'] : fs.custOn < fs.cust ? ['partial', 'PARTIAL'] : ['live', 'LIVE'];
        tr = el('tr');
        tr.appendChild(el('td', null, fd.name)); tr.appendChild(el('td', null, fd.section));
        var td = el('td'); td.appendChild(badge(state[0], state[1])); tr.appendChild(td);
        tr.appendChild(el('td', 'num', fs.tpsOn + ' / ' + fs.tps));
        tr.appendChild(el('td', 'num', fmt(fs.custOn) + ' / ' + fmt(fs.cust)));
        td = el('td', 'num'); td.appendChild(button('Trace', 'ghost', function () {
          var pts = []; fd.lines.forEach(function (id) { pts = pts.concat(net.lines[id].path); });
          map.flyToBounds(L.latLngBounds(pts).pad(0.15), { duration: 0.8, maxZoom: 16 });
        })); tr.appendChild(td);
        tb.appendChild(tr);
      });
    }
    if (st.gens.length) {
      body.appendChild(el('h4', null, st.kind === 'tie' ? 'Infeed' : 'Generating units'));
      tb = table([['Unit'], ['State'], ['Rated', 'num'], ['']]);
      st.gens.forEach(function (g) {
        var sw = net.switches[g.sw]; tr = el('tr');
        tr.appendChild(el('td', null, g.name));
        var td = el('td'); td.appendChild(badge(sw.closed ? 'live' : 'open', sw.closed ? 'SYNCHRONISED' : 'OFF-LINE')); tr.appendChild(td);
        tr.appendChild(el('td', 'num', g.mw + ' MW'));
        td = el('td', 'num'); td.appendChild(button('Select breaker', 'ghost', function () { selected = g.sw; renderPanel(); })); tr.appendChild(td);
        tb.appendChild(tr);
      });
    }
    if (st.lineIds.length) {
      body.appendChild(el('h4', null, 'Connected lines'));
      tb = table([['Line'], ['State'], ['']]);
      st.lineIds.forEach(function (id) {
        var l = net.lines[id], other = l.a === st.id ? l.b : l.a; tr = el('tr');
        tr.appendChild(el('td', null, l.name));
        var td = el('td'); td.appendChild(badge(net.lineStatus(l))); tr.appendChild(td);
        td = el('td', 'num'); td.appendChild(button('Go to ' + net.stations[other].name, 'ghost', function () { goStation(other); })); tr.appendChild(td);
        tb.appendChild(tr);
      });
    }
    panel.scrollTop = keep;
  }

  /* ================= boot ================= */

  function seedLog() {
    events = [];
    log('info', 'Session started — ' + net.stationList.length + ' stations, ' + net.tpList.length + ' transformer points, ' + fmt(net.stats().cust) + ' customers in model');
    net.scenario.forEach(function (s) { log(s.type, s.text); });
  }
  $('resetBtn').addEventListener('click', function () {
    net = Grid.build(); selected = null; seedLog(); map.closePopup(); refresh(); toast('Demo restored to its opening scenario');
  });
  $('menuBtn').addEventListener('click', function () { $('side').classList.toggle('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) closePanel(); });

  function tick() {
    $('clock').textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Ulaanbaatar' }) + ' ULAT';
  }
  setInterval(tick, 1000); tick();
  setInterval(function () { loadFactor = 0.62 + Math.sin(Date.now() / 60000) * 0.03 + (Math.random() - 0.5) * 0.01; renderKpis(); }, 3000);

  seedLog(); refresh();
  window.UBGrid = { map: map, net: function () { return net; }, openStation: openStation, goStation: goStation, operate: operate };
})();
