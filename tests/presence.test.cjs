const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function app({authenticated = true, secure = false} = {}) {
  const elements = new Map(), sockets = [], timers = new Map(), intervals = new Map(), listeners = new Map();
  let clock = 0, nextTimer = 0, redirected = null, expired = 0;
  function element(id) {
    if (id === 'campusPresenceConfig' && !authenticated) return null;
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', dataset: {}, children: [],
      replaceChildren() {this.children = [];}, append(item) {this.children.push(item);},
      addEventListener(name, callback) {listeners.set(id + ':' + name, callback);},
    });
    return elements.get(id);
  }
  if (authenticated) element('campusPresenceConfig').textContent = JSON.stringify({socketPath: '/ws/campus/', loginUrl: '/accounts/login/'});
  class Socket {
    static OPEN = 1; static CLOSED = 3;
    constructor(url) {this.url = url; this.readyState = 1; this.sent = []; sockets.push(this);}
    send(text) {this.sent.push(JSON.parse(text));}
    close(code = 1000) {this.readyState = 3; this.onclose?.({code});}
    receive(data) {this.onmessage({data: JSON.stringify(data)});}
  }
  const protocol = secure ? 'https:' : 'http:';
  const context = vm.createContext({URL, WebSocket: Socket, performance: {now: () => clock},
    window: {location: {protocol, href: protocol + '//127.0.0.1:8000/', assign(url) {redirected = url;}},
      addEventListener(name, callback) {listeners.set('window:' + name, callback);}},
    document: {getElementById: element, createElement: () => ({textContent: ''}),
      addEventListener(name, callback) {listeners.set('document:' + name, callback);}},
    setTimeout(callback, delay) {const id = ++nextTimer; timers.set(id, {callback, delay}); return id;},
    clearTimeout(id) {timers.delete(id);},
    setInterval(callback, delay) {const id = ++nextTimer; intervals.set(id, {callback, delay}); return id;},
    clearInterval(id) {intervals.delete(id);},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/presence.js'), 'utf8'), context);
  const player = {x: 1262.125, y: 437.875, dir: 'down', color: '#dfa34d', moving: false};
  const presence = context.window.CampusPresence.create({player, width: 1632, height: 820, onAuthExpired() {expired++;}});
  const peer = (changes = {}) => ({id: 'peer', nickname: '조원 이름', x: 1200, y: 437,
    dir: 'down', color: '#4e9b91', moving: false, ...changes});
  function welcome(socket = sockets.at(-1)) {
    socket.receive({type: 'welcome', selfId: 'self', players: [peer({id: 'self', nickname: '내 이름'}), peer()]});
  }
  return {presence, player, sockets, timers, intervals, listeners, element, peer, welcome,
    tick(t, dt = .016) {clock = t; presence.tick(t, dt);},
    get redirected() {return redirected;}, get expired() {return expired;}};
}

const standalone = app({authenticated: false});
standalone.tick(200); assert.equal(standalone.sockets.length, 0); assert.equal(standalone.presence.peers.size, 0);

const live = app(), socket = live.sockets[0];
assert.equal(socket.url, 'ws://127.0.0.1:8000/ws/campus/');
live.welcome();
assert.equal(live.element('presenceStatus').textContent, '접속 2명');
assert.equal(live.element('presencePeers').children[0].textContent, '조원 이름');
assert.equal(live.presence.peers.size, 1); // self is always rendered locally as 나
assert.equal(socket.sent[0].x, 1262.125); assert.equal(socket.sent[0].y, 437.875);
live.player.x += .375; live.player.moving = true;
live.tick(50); assert.equal(socket.sent.length, 1);
live.tick(100); assert.equal(socket.sent.length, 2); assert.equal(socket.sent[1].x, 1262.5);
live.tick(120); live.tick(190); assert.equal(socket.sent.length, 2);
live.player.moving = false; live.tick(200);
assert.equal(socket.sent.length, 3); assert.equal(socket.sent[2].moving, false);
live.tick(400); assert.equal(socket.sent.length, 3); // no redundant idle position writes

socket.receive({type: 'move', player: live.peer({x: 1230.25, moving: true})});
live.tick(416);
const smooth = live.presence.peers.get('peer');
assert(smooth.x > 1200 && smooth.x < 1230.25, 'Remote walking is interpolated');
socket.receive({type: 'move', player: live.peer({x: 365.75, nickname: '변경된 이름'})});
assert.equal(smooth.x, 365.75, 'Room teleport snaps instead of crossing walls');
assert.equal(live.element('presencePeers').children[0].textContent, '변경된 이름');
socket.receive({type: 'leave', id: 'peer'});
assert.equal(live.presence.peers.size, 0); assert.equal(live.element('presenceStatus').textContent, '접속 1명');

socket.close(1006);
assert.equal(live.intervals.size, 0); assert.equal(live.timers.size, 1);
assert.equal(live.element('presenceStatus').dataset.state, 'disconnected');
[...live.timers.values()][0].callback();
live.welcome(); assert.equal(live.sockets.length, 2); assert.equal(live.presence.peers.size, 1);
live.listeners.get('campusLogoutForm:submit')();
assert.equal(live.sockets[1].readyState, 3); assert.equal(live.timers.size, 0); assert.equal(live.intervals.size, 0);

const expired = app(); expired.welcome(); expired.sockets[0].close(4401);
assert.equal(expired.expired, 1); assert.equal(expired.redirected, '/accounts/login/'); assert.equal(expired.timers.size, 0);
const secure = app({secure: true}); assert.equal(secure.sockets[0].url, 'wss://127.0.0.1:8000/ws/campus/'); secure.presence.close();
console.log('PASS: standalone preview, nickname roster, precise/throttled movement, stop, interpolation, teleport, leave, reconnect, logout, expired session, WSS');
