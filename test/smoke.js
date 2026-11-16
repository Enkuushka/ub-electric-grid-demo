// Sanity checks for the network model:  node test/smoke.js
require('../js/network.js');
const assert = require('assert');

const net = Grid.build();
const fresh = () => { const n = Grid.build(); Object.values(n.lines).forEach(l => l.fault = false);
  Object.values(n.switches).forEach(s => s.closed = s.normal); n.switches['sw:bayangol-F2'].closed = true; n.compute(); return n; };

console.log('stations', net.stationList.length, 'lines', net.lineList.length,
  'feeders', net.feederList.length, 'TPs', net.tpList.length, 'consumers', net.consumerList.length, 'ties', net.ties.length);

// opening scenario has outages
let s = net.stats();
assert(s.faults === 2, 'two seeded faults');
assert(s.custOn < s.cust, 'some customers off at start');

// healthy network: everything energised
let n = fresh(); s = n.stats();
assert.strictEqual(s.custOn, s.cust, 'all customers on when healthy');
n.stationList.forEach(st => assert.strictEqual(n.stationStatus(st), 'live', st.id));

// opening a feeder breaker kills exactly that feeder
const fd = n.feeders['tuv-F1'];
n.switches[fd.sw].closed = false; n.compute();
assert.strictEqual(n.feederStats(fd).custOn, 0, 'feeder dead');
assert(n.stats().custOn < s.cust);
n.switches[fd.sw].closed = true; n.compute();

// losing one 10 kV transformer drops a bus section; the coupler restores it
n.switches['sw:tuv:T-1:l'].closed = false; n.compute();
assert(!n.isLive('b:tuv:10:A') && n.isLive('b:tuv:10:B'));
n.switches['sw:tuv:bc'].closed = true; n.compute();
assert(n.isLive('b:tuv:10:A'), 'coupler restores section A');

// radial 35 kV substation goes dark when its only line faults
n = fresh();
const l35 = n.lineList.find(l => l.kv === 35 && l.b === 'zaisan');
l35.fault = true; n.compute();
assert.strictEqual(n.stationStatus(n.stations.zaisan), 'dead');
assert.strictEqual(n.lineStatus(l35), 'fault');

// N-1 on the 110 kV ring: no customer lost
n = fresh();
n.lineList.find(l => l.kv === 110 && l.a === 'chp3' && l.b === 'tuv').fault = true; n.compute();
assert.strictEqual(n.stats().custOn, n.stats().cust, 'ring holds');

// preview does not change state
n = fresh();
const sw = n.switches['sw:bzd-F2'];
const p = n.preview(() => sw.closed = false, () => sw.closed = true);
assert(p.lost > 0 && sw.closed && n.stats().custOn === n.stats().cust);

console.log('ok');
