/*
 * UB Grid Monitor — network model (demo data).
 *
 * Builds a synthetic but plausible model of the Ulaanbaatar grid:
 *   plants -> 220/110 kV transmission -> 35 kV -> 10 kV feeders -> 10/0.4 kV
 *   transformer points (TP) -> 0.4 kV service cables -> consumers.
 *
 * Everything electrical is a graph: nodes are buses / cable ends, edges are
 * switches (open or closed) and lines (healthy or faulted). A node is live
 * when a closed, healthy path connects it to a generator.
 *
 * No DOM access here, so this file also runs under Node for testing.
 */
(function (root) {
  'use strict';

  var MLAT = 111320;
  function off(p, dx, dy) {
    return [p[0] + dy / MLAT, p[1] + dx / (MLAT * Math.cos(p[0] * Math.PI / 180))];
  }
  function distM(a, b) {
    var dy = (a[0] - b[0]) * MLAT;
    var dx = (a[1] - b[1]) * MLAT * Math.cos(a[0] * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- static definitions (positions are approximate) ---------- */

  var STATIONS = [
    { id: 'chp4', kind: 'plant', name: 'CHP-4', sub: 'Thermal Power Plant No. 4', pos: [47.8935, 106.8040], buses: [220, 110],
      gens: [['TG-1', 100], ['TG-2', 100], ['TG-3', 100], ['TG-4', 123], ['TG-5', 123]] },
    { id: 'chp3', kind: 'plant', name: 'CHP-3', sub: 'Thermal Power Plant No. 3', pos: [47.8958, 106.8470], buses: [110],
      gens: [['TG-1', 48], ['TG-2', 50], ['TG-3', 50], ['TG-4', 50]] },
    { id: 'chp2', kind: 'plant', name: 'CHP-2', sub: 'Thermal Power Plant No. 2', pos: [47.9080, 106.7830], buses: [35],
      gens: [['TG-1', 12], ['TG-2', 9]] },
    { id: 'tie', kind: 'tie', name: 'Central Grid Tie', sub: '220 kV interconnection towards Darkhan / Erdenet', pos: [47.9500, 106.6900], buses: [220],
      gens: [['CES infeed', 300]] },

    { id: 'songino', kind: 'ss', name: 'Songino', pos: [47.9210, 106.7380], buses: [220, 110] },
    { id: 'east', kind: 'ss', name: 'Züün (East)', pos: [47.9230, 107.0420], buses: [220, 110] },

    { id: 'tolgoit', kind: 'ss', name: 'Tolgoit', pos: [47.9290, 106.8010], buses: [110, 35, 10], feeders: 6, area: 'mixed' },
    { id: 'bayangol', kind: 'ss', name: 'Bayangol', pos: [47.9135, 106.8640], buses: [110, 10], feeders: 6, area: 'urban' },
    { id: 'tuv', kind: 'ss', name: 'Töv (Central)', pos: [47.9215, 106.9120], buses: [110, 10], feeders: 6, area: 'urban' },
    { id: 'selbe', kind: 'ss', name: 'Selbe', pos: [47.9440, 106.9230], buses: [110, 35, 10], feeders: 5, area: 'mixed' },
    { id: 'bzd', kind: 'ss', name: 'Bayanzürkh', pos: [47.9170, 106.9700], buses: [110, 10], feeders: 6, area: 'urban' },
    { id: 'amgalan', kind: 'ss', name: 'Amgalan', pos: [47.9105, 107.0050], buses: [110, 35, 10], feeders: 5, area: 'mixed' },
    { id: 'khanuul', kind: 'ss', name: 'Khan-Uul', pos: [47.8840, 106.9010], buses: [110, 35, 10], feeders: 5, area: 'urban' },
    { id: 'yarmag', kind: 'ss', name: 'Yarmag', pos: [47.8705, 106.8250], buses: [110, 10], feeders: 5, area: 'mixed' },

    { id: 'bayankhoshuu', kind: 'ss', name: 'Bayankhoshuu', pos: [47.9490, 106.8330], buses: [35, 10], feeders: 4, area: 'ger' },
    { id: 'chingeltei', kind: 'ss', name: 'Chingeltei', pos: [47.9520, 106.8870], buses: [35, 10], feeders: 4, area: 'ger' },
    { id: 'dariekh', kind: 'ss', name: 'Dari-Ekh', pos: [47.9450, 106.9620], buses: [35, 10], feeders: 4, area: 'ger' },
    { id: 'zaisan', kind: 'ss', name: 'Zaisan', pos: [47.8830, 106.9330], buses: [35, 10], feeders: 4, area: 'urban' },
    { id: 'uildver', kind: 'ss', name: 'Üildver (Industrial)', pos: [47.9040, 106.8330], buses: [35, 10], feeders: 4, area: 'ind' },
    { id: 'uliastai', kind: 'ss', name: 'Uliastai', pos: [47.9330, 107.0300], buses: [35, 10], feeders: 4, area: 'ger' }
  ];

  var LINES = [
    [220, 'chp4', 'songino', [[47.9000, 106.7700]]],
    [220, 'songino', 'tie', [[47.9360, 106.7150]]],
    [220, 'chp4', 'east', [[47.8770, 106.8600], [47.8730, 106.9500], [47.8860, 107.0200]]],
    [220, 'songino', 'east', [[47.9620, 106.8000], [47.9720, 106.9200], [47.9560, 107.0100]]],

    [110, 'songino', 'tolgoit', [[47.9290, 106.7700]]],
    [110, 'chp4', 'tolgoit', [[47.9120, 106.7990]]],
    [110, 'chp4', 'bayangol', [[47.9085, 106.8400]]],
    [110, 'chp3', 'bayangol', []],
    [110, 'chp3', 'tuv', [[47.9050, 106.8850]]],
    [110, 'chp3', 'khanuul', [[47.8880, 106.8700]]],
    [110, 'chp4', 'yarmag', [[47.8800, 106.8120]]],
    [110, 'yarmag', 'khanuul', [[47.8720, 106.8650]]],
    [110, 'tolgoit', 'selbe', [[47.9360, 106.8450], [47.9400, 106.8950]]],
    [110, 'bayangol', 'tuv', [[47.9185, 106.8880]]],
    [110, 'tuv', 'bzd', [[47.9245, 106.9400]]],
    [110, 'selbe', 'bzd', [[47.9340, 106.9480]]],
    [110, 'bzd', 'amgalan', []],
    [110, 'east', 'amgalan', [[47.9150, 107.0250]]],
    [110, 'khanuul', 'amgalan', [[47.8890, 106.9550], [47.8990, 106.9900]]],

    [35, 'tolgoit', 'bayankhoshuu', [[47.9400, 106.8200]]],
    [35, 'selbe', 'chingeltei', [[47.9500, 106.9050]]],
    [35, 'selbe', 'dariekh', [[47.9470, 106.9430]]],
    [35, 'khanuul', 'zaisan', [[47.8800, 106.9170]]],
    [35, 'chp2', 'uildver', [[47.9060, 106.8080]]],
    [35, 'chp2', 'tolgoit', [[47.9200, 106.7880]]],
    [35, 'amgalan', 'uliastai', [[47.9230, 107.0170]]]
  ];

  var CONSUMER_TYPES = {
    apt:      { label: 'Apartment block',        cust: [60, 160], kwPer: 1.3 },
    ger:      { label: 'Ger district street',    cust: [25, 70],  kwPer: 0.9 },
    shop:     { label: 'Shops & offices',        cust: [4, 18],   kwPer: 6 },
    factory:  { label: 'Workshop / factory',     cust: [1, 3],    kwPer: 90 },
    school:   { label: 'School',                 cust: [1, 1],    kwPer: 80 },
    kinder:   { label: 'Kindergarten',           cust: [1, 1],    kwPer: 40 },
    hospital: { label: 'Hospital / clinic',      cust: [1, 1],    kwPer: 160, critical: true },
    pump:     { label: 'Water & heat pump station', cust: [1, 1], kwPer: 90,  critical: true },
    light:    { label: 'Street lighting',        cust: [1, 1],    kwPer: 15 }
  };
  var AREA_MIX = {
    urban: ['apt', 'apt', 'apt', 'apt', 'apt', 'shop', 'shop', 'school', 'kinder', 'hospital', 'pump', 'light'],
    ger:   ['ger', 'ger', 'ger', 'ger', 'ger', 'ger', 'ger', 'shop', 'school', 'pump', 'light'],
    ind:   ['factory', 'factory', 'factory', 'factory', 'shop', 'shop', 'apt', 'apt', 'pump', 'light'],
    mixed: ['apt', 'apt', 'apt', 'ger', 'ger', 'ger', 'shop', 'school', 'kinder', 'pump', 'light']
  };

  var U = 14;      // metres per layout unit inside a substation yard
  var ROW = 3;     // layout units between busbar rows
  var YT = 1.7;    // layout units from a busbar to its line terminal

  /* ---------- builder ---------- */

  function build(seed) {
    var rnd = rng(seed || 20261116);
    var net = {
      stations: {}, stationList: [], lines: {}, lineList: [], switches: {},
      edges: [], adj: {}, sources: [], tps: {}, tpList: [], consumers: {}, consumerList: [],
      feeders: {}, feederList: [], ties: [], live: {}, dist: {}
    };

    function addSwitch(id, o) { o.id = id; o.normal = o.closed; net.switches[id] = o; return id; }
    function addEdge(a, b, sw, line) {
      var i = net.edges.push({ a: a, b: b, sw: sw || null, line: line || null }) - 1;
      (net.adj[a] || (net.adj[a] = [])).push(i);
      (net.adj[b] || (net.adj[b] = [])).push(i);
      if (sw) { net.switches[sw].a = a; net.switches[sw].b = b; }
    }
    function addLine(o) {
      o.fault = false; net.lines[o.id] = o; net.lineList.push(o);
      addEdge(o.na, o.nb, null, o.id);
      var la = 90, lb = -90, lc = 180, ld = -180;
      o.path.forEach(function (p) { la = Math.min(la, p[0]); lb = Math.max(lb, p[0]); lc = Math.min(lc, p[1]); ld = Math.max(ld, p[1]); });
      o.bb = [la, lc, lb, ld];
      return o;
    }

    var defById = {};
    STATIONS.forEach(function (d) { defById[d.id] = d; });

    // which transmission lines land on which station bus
    var lineDefs = LINES.map(function (l, i) {
      return { id: 'L' + l[0] + '-' + (i + 1), kv: l[0], a: l[1], b: l[2], via: l[3],
               name: l[0] + ' kV ' + defById[l[1]].name + ' – ' + defById[l[2]].name };
    });
    var landing = {};
    lineDefs.forEach(function (l) {
      ['a', 'b'].forEach(function (end) {
        var sid = l[end], other = l[end === 'a' ? 'b' : 'a'];
        var k = sid + ':' + l.kv;
        (landing[k] || (landing[k] = [])).push({ line: l, end: end, other: other });
      });
    });

    /* ----- stations: single-line layout + electrical graph ----- */

    STATIONS.forEach(function (d) {
      var st = {
        id: d.id, kind: d.kind, name: d.name, sub: d.sub || '', pos: d.pos, buses: d.buses, area: d.area,
        prims: [], terms: {}, feeders: [], switches: [], busNodes: [], gens: [], lineIds: []
      };
      st.title = d.kind === 'ss' ? d.name + ' ' + d.buses.join('/') + ' kV' : d.name;
      net.stations[d.id] = st; net.stationList.push(st);

      var P = st.prims, n = d.buses.length, low = n - 1;
      var by = function (i) { return -i * ROW; };
      var F = d.feeders || 0, G = (d.gens || []).length;
      var busNode = function (i, tag) { return 'b:' + d.id + ':' + d.buses[i] + (tag ? ':' + tag : ''); };
      var sw = function (id, o) { o.station = d.id; st.switches.push(id); return addSwitch(id, o); };
      var linesOn = function (i) {
        return (landing[d.id + ':' + d.buses[i]] || []).slice().sort(function (p, q) {
          return defById[p.other].pos[1] - defById[q.other].pos[1];
        });
      };

      // lowest bus: one section for generators, two (A/B + coupler) for feeders
      var secs = [];
      if (F) { var nA = Math.ceil(F / 2); secs = [{ n: nA, tag: 'A' }, { n: F - nA, tag: 'B' }]; }
      else secs = [{ n: Math.max(G, 2), tag: '' }];
      var cur = 0;
      secs.forEach(function (s) {
        s.xs = []; for (var i = 0; i < s.n; i++) s.xs.push(cur + i);
        s.x0 = cur - 0.5; s.x1 = cur + s.n - 0.5; cur += s.n + 1;
        s.node = busNode(low, s.tag);
      });

      // transformers
      var xfs = [];
      if (n >= 2) {
        if (F) { xfs.push({ n: 'T-1', a: 0, b: low, sec: 0 }, { n: 'T-2', a: 0, b: low, sec: 1 }); }
        else { xfs.push({ n: 'AT-1', a: 0, b: low, sec: 0 }, { n: 'AT-2', a: 0, b: low, sec: 0 }); }
        if (n === 3) xfs.push({ n: 'T-3', a: 0, b: 1 });
      }
      secs.forEach(function (s, si) {
        var mine = xfs.filter(function (x) { return x.b === low && x.sec === si; });
        mine.forEach(function (x, k) { x.x = s.x0 + (s.x1 - s.x0) * (k + 1) / (mine.length + 1); });
      });

      var topAttach = xfs.filter(function (x) { return x.a === 0 && x.b === low; }).map(function (x) { return x.x; });
      var bays = [];      // {x, bus index, node, landing}
      var topLines = linesOn(0);
      var c0 = topAttach.length ? (Math.min.apply(null, topAttach) + Math.max.apply(null, topAttach)) / 2
                                : (secs[0].x0 + secs[secs.length - 1].x1) / 2;
      topLines.forEach(function (ld, i) {
        var x = c0 + (i - (topLines.length - 1) / 2);
        topAttach.push(x);
        bays.push({ x: x, bus: 0, ld: ld });
      });

      var lastSec = secs[secs.length - 1];
      var xr = Math.max(lastSec.x1, Math.max.apply(null, topAttach.concat([-9])) + 0.5) + 1;
      var mid = null;
      if (n === 3) {
        var t3 = xfs[2]; t3.x = xr; topAttach.push(xr);
        var ml = linesOn(1);
        ml.forEach(function (ld, i) { bays.push({ x: xr + 1 + i, bus: 1, ld: ld }); });
        mid = { x0: xr - 0.5, x1: xr + ml.length + 0.5 };
        xr += ml.length + 2;
      }
      if (n > 1 && !F) {
        var ll = linesOn(low);
        if (ll.length) {
          ll.forEach(function (ld, i) { bays.push({ x: xr + i, bus: low, ld: ld }); });
          lastSec.x1 = xr + ll.length - 0.5;
        }
      }
      if (n === 1) {
        var xsAll = topAttach;
        secs[0].x0 = Math.min(secs[0].x0, Math.min.apply(null, xsAll) - 0.5);
        secs[0].x1 = Math.max(secs[0].x1, Math.max.apply(null, xsAll) + 0.5);
      }

      // busbars
      if (n > 1) {
        P.push({ t: 'bus', node: busNode(0), kv: d.buses[0], x0: Math.min.apply(null, topAttach) - 0.5, x1: Math.max.apply(null, topAttach) + 0.5, y: 0, lab: 'side' });
        st.busNodes.push(busNode(0));
      }
      if (mid) {
        P.push({ t: 'bus', node: busNode(1), kv: d.buses[1], x0: mid.x0, x1: mid.x1, y: by(1), lab: 'right' });
        st.busNodes.push(busNode(1));
      }
      secs.forEach(function (s) {
        P.push({ t: 'bus', node: s.node, kv: d.buses[low], x0: s.x0, x1: s.x1, y: by(low), lab: n === 1 ? 'side' : 'top', tag: s.tag });
        st.busNodes.push(s.node);
      });
      if (secs.length === 2) {
        var xm = (secs[0].x1 + secs[1].x0) / 2, yl = by(low), kvl = d.buses[low];
        var bc = sw('sw:' + d.id + ':bc', { name: kvl + ' kV bus coupler', kind: 'coupler', closed: false, kv: kvl });
        P.push({ t: 'wire', node: secs[0].node, kv: kvl, pts: [[secs[0].x1, yl], [xm - 0.25, yl]] });
        P.push({ t: 'wire', node: secs[1].node, kv: kvl, pts: [[xm + 0.25, yl], [secs[1].x0, yl]] });
        P.push({ t: 'sw', sw: bc, x: xm, y: yl, kv: kvl });
        addEdge(secs[0].node, secs[1].node, bc);
      }

      // line bays (always leave towards the top of the yard)
      bays.forEach(function (b) {
        var l = b.ld.line, kv = d.buses[b.bus], yb = by(b.bus);
        var bn = b.bus === low ? lastSec.node : busNode(b.bus);
        if (n === 1) bn = secs[0].node;
        var ln = 'ln:' + l.id + ':' + b.ld.end;
        var id = sw('sw:' + d.id + ':' + l.id, { name: 'Line breaker → ' + defById[b.ld.other].name, kind: 'cb', closed: true, kv: kv });
        P.push({ t: 'wire', node: bn, kv: kv, pts: [[b.x, yb], [b.x, yb + 0.55]] });
        P.push({ t: 'sw', sw: id, x: b.x, y: yb + 0.8, kv: kv });
        P.push({ t: 'wire', node: ln, kv: kv, pts: [[b.x, yb + 1.05], [b.x, YT]] });
        P.push({ t: 'term', dir: 'up', x: b.x, y: YT, kv: kv, node: ln, line: l.id, other: b.ld.other, label: defById[b.ld.other].name });
        st.terms[l.id] = [b.x, YT];
        st.lineIds.push(l.id);
        addEdge(bn, ln, id);
      });

      // transformers
      xfs.forEach(function (x) {
        var ya = by(x.a), yb = by(x.b), ym = (ya + yb) / 2, kva = d.buses[x.a], kvb = d.buses[x.b];
        var na = busNode(x.a), nb = x.b === low ? secs[x.sec || 0].node : busNode(x.b);
        var h = 'x:' + d.id + ':' + x.n + ':h', l = 'x:' + d.id + ':' + x.n + ':l';
        var sh = sw('sw:' + d.id + ':' + x.n + ':h', { name: x.n + ' ' + kva + ' kV breaker', kind: 'cb', closed: true, kv: kva });
        var sl = sw('sw:' + d.id + ':' + x.n + ':l', { name: x.n + ' ' + kvb + ' kV breaker', kind: 'cb', closed: true, kv: kvb });
        var mva = kva === 220 ? 125 : kva === 110 ? (kvb === 35 ? 16 : 25) : 10;
        P.push({ t: 'wire', node: na, kv: kva, pts: [[x.x, ya], [x.x, ya - 0.55]] });
        P.push({ t: 'sw', sw: sh, x: x.x, y: ya - 0.8, kv: kva });
        P.push({ t: 'wire', node: h, kv: kva, pts: [[x.x, ya - 1.05], [x.x, ym + 0.5]] });
        P.push({ t: 'xf', x: x.x, y: ym, nodeH: h, nodeL: l, kvH: kva, kvL: kvb, label: x.n, mva: mva, left: x.b !== low });
        P.push({ t: 'wire', node: l, kv: kvb, pts: [[x.x, ym - 0.5], [x.x, yb + 1.05]] });
        P.push({ t: 'sw', sw: sl, x: x.x, y: yb + 0.8, kv: kvb });
        P.push({ t: 'wire', node: nb, kv: kvb, pts: [[x.x, yb + 0.55], [x.x, yb]] });
        addEdge(na, h, sh); addEdge(h, l); addEdge(l, nb, sl);
      });

      // feeders / generators hanging below the lowest bus
      var yl2 = by(low), kvLow = d.buses[low], fi = 0;
      secs.forEach(function (s) {
        s.xs.forEach(function (x, i) {
          if (F) {
            var fid = d.id + '-F' + (++fi), head = 'fd:' + fid;
            var id = sw('sw:' + fid, { name: 'Feeder F-' + fi + ' breaker', kind: 'cb', closed: true, kv: kvLow, feeder: fid });
            P.push({ t: 'wire', node: s.node, kv: kvLow, pts: [[x, yl2], [x, yl2 - 0.55]] });
            P.push({ t: 'sw', sw: id, x: x, y: yl2 - 0.8, kv: kvLow });
            P.push({ t: 'wire', node: head, kv: kvLow, pts: [[x, yl2 - 1.05], [x, yl2 - YT]] });
            P.push({ t: 'term', dir: 'down', x: x, y: yl2 - YT, kv: kvLow, node: head, feeder: fid, label: 'F-' + fi });
            addEdge(s.node, head, id);
            var fd = { id: fid, name: 'F-' + fi, station: d.id, section: s.tag, head: head, sw: id, tps: [], lines: [], term: [x, yl2 - YT], idx: fi - 1 };
            net.feeders[fid] = fd; net.feederList.push(fd); st.feeders.push(fid);
          } else if (i < G) {
            var g = d.gens[i], gn = 'g:' + d.id + ':' + i;
            var gid = sw('sw:' + d.id + ':g' + i, { name: g[0] + ' generator breaker', kind: 'cb', closed: true, kv: kvLow });
            P.push({ t: 'wire', node: s.node, kv: kvLow, pts: [[x, yl2], [x, yl2 - 0.55]] });
            P.push({ t: 'sw', sw: gid, x: x, y: yl2 - 0.8, kv: kvLow });
            P.push({ t: 'wire', node: gn, kv: kvLow, pts: [[x, yl2 - 1.05], [x, yl2 - 1.4]] });
            P.push({ t: 'gen', x: x, y: yl2 - 1.8, node: gn, kv: kvLow, label: g[0], mw: g[1], sw: gid });
            addEdge(s.node, gn, gid);
            net.sources.push(gn);
            st.gens.push({ name: g[0], mw: g[1], sw: gid, node: gn });
          }
        });
      });

      // bounding box and geo mapping
      var x0 = 1e9, x1 = -1e9;
      P.forEach(function (p) {
        if (p.t === 'bus') { x0 = Math.min(x0, p.x0); x1 = Math.max(x1, p.x1); }
        else if (p.x !== undefined) { x0 = Math.min(x0, p.x - 0.5); x1 = Math.max(x1, p.x + 0.5); }
      });
      st.bbox = { x0: x0, x1: x1, y0: yl2 - YT - (G ? 0.6 : 0), y1: YT };
      var cx = (x0 + x1) / 2, cy = (st.bbox.y0 + st.bbox.y1) / 2;
      st.geo = function (x, y) { return off(d.pos, (x - cx) * U, (y - cy) * U); };
      var pad = 0.9;
      st.yard = [st.geo(x0 - pad, st.bbox.y1 + pad), st.geo(x1 + pad, st.bbox.y1 + pad), st.geo(x1 + pad, st.bbox.y0 - pad), st.geo(x0 - pad, st.bbox.y0 - pad)];
    });

    /* ----- transmission / sub-transmission lines ----- */

    function approach(st, lineId, towards, k) {
      var t = st.terms[lineId], s = 0.3 * k;
      var pts = [st.geo(t[0], t[1]), st.geo(t[0], t[1] + 1.3 + s)];
      if (towards[0] < st.pos[0] - 0.0006) { // destination is south: go round the yard
        var xs = towards[1] >= st.pos[1] ? st.bbox.x1 + 1.7 + s : st.bbox.x0 - 1.7 - s;
        pts.push(st.geo(xs, t[1] + 1.3 + s));
        pts.push(st.geo(xs, st.bbox.y0 - 1.2));
      }
      return pts;
    }
    lineDefs.forEach(function (l) {
      var A = net.stations[l.a], B = net.stations[l.b];
      var pa = approach(A, l.id, l.via[0] || B.pos, A.lineIds.indexOf(l.id));
      var pb = approach(B, l.id, l.via[l.via.length - 1] || A.pos, B.lineIds.indexOf(l.id)).reverse();
      addLine({ id: l.id, kv: l.kv, name: l.name, a: l.a, b: l.b, path: pa.concat(l.via, pb), na: 'ln:' + l.id + ':a', nb: 'ln:' + l.id + ':b' });
    });

    /* ----- 10 kV feeders, transformer points, 0.4 kV services ----- */

    var tpNo = 1001, cNo = 1;
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

    function mkTP(pos, fd, st) {
      var id = 'TP-' + (tpNo++);
      var tp = { id: id, pos: pos, feeder: fd.id, station: st.id, kva: pick([250, 400, 400, 630, 630, 1000]),
                 mv: 'tp:' + id + ':mv', lv: 'tp:' + id + ':lv', sw: 'sw:' + id, consumers: [] };
      addSwitch(tp.sw, { name: id + ' LV main switch', kind: 'lbs', closed: true, kv: 0.4, tp: id });
      addEdge(tp.mv, tp.lv, tp.sw);
      net.tps[id] = tp; net.tpList.push(tp); fd.tps.push(id);
      var k = 3 + Math.floor(rnd() * 3), base = rnd() * 360;
      for (var j = 0; j < k; j++) {
        var a = (base + j * 360 / k + (rnd() - 0.5) * 40) * Math.PI / 180, r = 50 + rnd() * 75;
        var cp = off(pos, Math.cos(a) * r, Math.sin(a) * r);
        var type = pick(AREA_MIX[st.area || 'mixed']), T = CONSUMER_TYPES[type];
        var cust = T.cust[0] + Math.floor(rnd() * (T.cust[1] - T.cust[0] + 1));
        var cid = 'C' + (cNo++);
        var c = { id: cid, pos: cp, tp: id, type: type, label: T.label, name: T.label + ' ' + cid.slice(1),
                  customers: cust, kw: Math.round(cust * T.kwPer), critical: !!T.critical, node: 'c:' + cid, line: 'SV-' + cid.slice(1) };
        net.consumers[cid] = c; net.consumerList.push(c); tp.consumers.push(cid);
        addLine({ id: c.line, kv: 0.4, name: '0.4 kV service to ' + c.name, path: [pos, [pos[0], cp[1]], cp],
                  na: tp.lv, nb: c.node, tp: id, consumer: cid, feeder: fd.id });
      }
      return tp;
    }

    net.stationList.forEach(function (st) {
      var d = defById[st.id], F = st.feeders.length;
      st.feeders.forEach(function (fid, i) {
        var fd = net.feeders[fid];
        var ang = (205 + i * 360 / F + (rnd() - 0.5) * 24) * Math.PI / 180;
        var cx = Math.cos(ang), sy = Math.sin(ang), sx = cx >= 0 ? 1 : -1, ss = sy >= 0 ? 1 : -1;
        var p = st.geo(fd.term[0], fd.term[1] - 0.9 - i * 0.3);
        var seg = [st.geo(fd.term[0], fd.term[1]), p];
        if (sy > 0.2) { // heading north: step round the yard first
          var e = st.geo(sx > 0 ? st.bbox.x1 + 1.6 + i * 0.3 : st.bbox.x0 - 1.6 - i * 0.3, 0);
          p = [p[0], e[1]]; seg.push(p);
        }
        var pew = Math.abs(cx) / (Math.abs(cx) + Math.abs(sy));
        var nTP = 5 + Math.floor(rnd() * 4), prev = fd.head, sNo = 0, trunk = [];
        function step(from, dx, dy, node, pre) {
          var np = off(from, dx, dy);
          var tp = mkTP(np, fd, st);
          var ln = addLine({ id: fid + '-S' + (++sNo), kv: 10, name: '10 kV ' + d.name + ' ' + fd.name + ' · section ' + sNo,
                             path: (pre || [from]).concat([np]), na: node, nb: tp.mv, feeder: fid });
          fd.lines.push(ln.id);
          return tp;
        }
        for (var k = 0; k < nTP; k++) {
          var len = 240 + rnd() * 200, ew = rnd() < pew;
          if (!ew && ss < 0 && p[0] - len / MLAT < 47.862) ew = true; // keep off Bogd Khan mountain
          var tp = step(p, ew ? sx * len : 0, ew ? 0 : ss * len, prev, seg);
          trunk.push({ tp: tp, ew: ew });
          prev = tp.mv; p = tp.pos; seg = null;
        }
        fd.end = trunk[trunk.length - 1].tp.id;
        // optional spur
        if (rnd() < 0.45 && trunk.length > 3) {
          var at = trunk[1 + Math.floor(rnd() * (trunk.length - 3))], q = at.tp.pos, pn = at.tp.mv, m = 1 + Math.floor(rnd() * 2);
          for (var j = 0; j < m; j++) {
            var l2 = 200 + rnd() * 140, sew = pew <= 0.5;
            if (!sew && ss > 0 && q[0] - l2 / MLAT < 47.862) break;
            var t2 = step(q, sew ? -sx * l2 : 0, sew ? 0 : -ss * l2, pn, null);
            q = t2.pos; pn = t2.mv;
          }
        }
      });
    });

    // normally-open tie switches between the ends of neighbouring feeders
    var ends = net.feederList.map(function (f) { return f; }), pairs = [];
    for (var i = 0; i < ends.length; i++) for (var j = i + 1; j < ends.length; j++) {
      var A = net.tps[ends[i].end], B = net.tps[ends[j].end], dm = distM(A.pos, B.pos);
      if (dm < 1100 && dm > 60) pairs.push([dm, ends[i], ends[j]]);
    }
    pairs.sort(function (a, b) { return a[0] - b[0]; });
    var tied = {}, tieNo = 0;
    pairs.forEach(function (pr) {
      var fa = pr[1], fb = pr[2];
      if (tied[fa.id] || tied[fb.id]) return;
      tied[fa.id] = tied[fb.id] = true;
      var A = net.tps[fa.end], B = net.tps[fb.end], no = ++tieNo;
      var path = [A.pos, [A.pos[0], B.pos[1]], B.pos];
      var dx = B.pos[1] >= A.pos[1] ? 1 : -1;
      var swPos = Math.abs(B.pos[1] - A.pos[1]) > 0.0004 ? off(A.pos, dx * 28, 0) : off(A.pos, 0, (B.pos[0] >= A.pos[0] ? 1 : -1) * 28);
      var x = 'tie:' + no, sid = 'sw:tie' + no;
      addSwitch(sid, { name: 'Tie switch RMU-' + no + ' (' + net.stations[fa.station].name + ' ' + fa.name + ' ↔ ' + net.stations[fb.station].name + ' ' + fb.name + ')',
                       kind: 'tie', closed: false, kv: 10, pos: swPos });
      addEdge(A.mv, x, sid);
      var ln = addLine({ id: 'TL-' + no, kv: 10, name: '10 kV tie cable RMU-' + no, path: path, na: x, nb: B.mv, tie: sid });
      net.ties.push({ id: sid, pos: swPos, line: ln.id, a: fa.id, b: fb.id });
    });

    /* ----- energisation ----- */

    net.compute = function () {
      var live = {}, dist = {}, q = [];
      net.sources.forEach(function (s) { live[s] = true; dist[s] = 0; q.push(s); });
      for (var h = 0; h < q.length; h++) {
        var u = q[h], es = net.adj[u] || [];
        for (var k = 0; k < es.length; k++) {
          var e = net.edges[es[k]];
          if (e.sw && !net.switches[e.sw].closed) continue;
          if (e.line && net.lines[e.line].fault) continue;
          var v = e.a === u ? e.b : e.a;
          if (!live[v]) { live[v] = true; dist[v] = dist[u] + 1; q.push(v); }
        }
      }
      net.live = live; net.dist = dist;
    };
    net.isLive = function (node) { return !!net.live[node]; };
    net.lineStatus = function (l) {
      if (l.fault) return 'fault';
      return net.live[l.na] || net.live[l.nb] ? 'live' : 'dead';
    };
    net.lineDir = function (l) {
      var a = net.dist[l.na], b = net.dist[l.nb];
      if (a === undefined || b === undefined || a === b) return 0;
      return a < b ? 1 : -1;
    };
    net.switchLive = function (s) { return !!(net.live[s.a] || net.live[s.b]); };
    net.stationStatus = function (st) {
      var n = 0; st.busNodes.forEach(function (b) { if (net.live[b]) n++; });
      return n === st.busNodes.length ? 'live' : n ? 'partial' : 'dead';
    };
    net.feederStats = function (fd) {
      var s = { tps: fd.tps.length, tpsOn: 0, cust: 0, custOn: 0, kw: 0, kwOn: 0 };
      fd.tps.forEach(function (id) {
        var tp = net.tps[id]; if (net.live[tp.mv]) s.tpsOn++;
        tp.consumers.forEach(function (cid) {
          var c = net.consumers[cid]; s.cust += c.customers; s.kw += c.kw;
          if (net.live[c.node]) { s.custOn += c.customers; s.kwOn += c.kw; }
        });
      });
      return s;
    };
    net.stats = function () {
      var s = { cust: 0, custOn: 0, kw: 0, kwOn: 0, sites: 0, sitesOff: 0, criticalOff: [], faults: 0, abnormal: [], tpsOff: 0, genMw: 0 };
      net.consumerList.forEach(function (c) {
        s.cust += c.customers; s.kw += c.kw; s.sites++;
        if (net.live[c.node]) { s.custOn += c.customers; s.kwOn += c.kw; }
        else { s.sitesOff++; if (c.critical) s.criticalOff.push(c); }
      });
      net.tpList.forEach(function (t) { if (!net.live[t.mv]) s.tpsOff++; });
      net.lineList.forEach(function (l) { if (l.fault) s.faults++; });
      Object.keys(net.switches).forEach(function (k) { var w = net.switches[k]; if (w.closed !== w.normal) s.abnormal.push(w); });
      net.stationList.forEach(function (st) { st.gens.forEach(function (g) { if (net.switches[g.sw].closed) s.genMw += g.mw; }); });
      return s;
    };
    /* Customers that would lose / regain supply if `mutate` were applied. */
    net.preview = function (mutate, undo) {
      var before = net.stats(); mutate(); net.compute();
      var after = net.stats(); undo(); net.compute();
      return { lost: Math.max(0, before.custOn - after.custOn), restored: Math.max(0, after.custOn - before.custOn),
               criticalOff: after.criticalOff.length - before.criticalOff.length };
    };

    /* ----- opening scenario so every line state is visible ----- */
    net.scenario = [];
    (function () {
      var l = net.lines['tuv-F3-S3'];
      if (l) { l.fault = true; net.scenario.push({ type: 'fault', text: l.name + ' — cable fault, protection tripped', ref: l.id }); }
      var s = net.switches['sw:bayangol-F2'];
      if (s) { s.closed = false; net.scenario.push({ type: 'open', text: 'Bayangol · Feeder F-2 breaker OPENED for planned maintenance', ref: s.id }); }
      var tp = net.tps[net.feeders['selbe-F1'].tps[1]];
      var sv = net.lines[net.consumers[tp.consumers[0]].line];
      sv.fault = true; net.scenario.push({ type: 'fault', text: sv.name + ' (' + tp.id + ') — service cable cut', ref: sv.id });
    })();

    net.compute();
    return net;
  }

  root.Grid = { build: build, off: off, distM: distM, CONSUMER_TYPES: CONSUMER_TYPES, U: U };
})(typeof window !== 'undefined' ? window : globalThis);
