/* Shared avatars; movement stays in world coordinates, independent of zoom. */
(() => {
  'use strict';
  window.CampusPresence = {
    create({player, width, height, onAuthExpired}) {
      const configElement = document.getElementById('campusPresenceConfig');
      const status = document.getElementById('presenceStatus');
      const roster = document.getElementById('presencePeers');
      const peers = new Map();
      if (!configElement) return {peers, tick() {}, close() {}};
      const config = JSON.parse(configElement.textContent);
      let socket = null, selfId = null, ready = false, closed = false;
      let retry = null, retryDelay = 1000, heartbeat = null, lastSent = -Infinity, lastState = '';
      const colors = new Set(['#dfa34d', '#4e9b91', '#8a78bb', '#cb7773', '#648eb5']);
      const directions = new Set(['up', 'down', 'left', 'right']);

      function setStatus(text, state) {
        status.hidden = false;
        status.textContent = text;
        status.dataset.state = state;
      }
      function updateRoster() {
        setStatus(`접속 ${peers.size + 1}명`, 'connected');
        roster.replaceChildren();
        for (const peer of peers.values()) {
          const item = document.createElement('li');
          item.textContent = peer.nickname;
          roster.append(item);
        }
      }
      function validPeer(p) {
        return p && typeof p.id === 'string' && typeof p.nickname === 'string'
          && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height
          && colors.has(p.color) && directions.has(p.dir) && typeof p.moving === 'boolean';
      }
      function upsert(p) {
        if (!validPeer(p) || p.id === selfId) return false;
        const now = performance.now(), peer = peers.get(p.id);
        if (!peer) {
          peers.set(p.id, {...p, targetX: p.x, targetY: p.y, receivedAt: now});
          return true;
        }
        const renamed = peer.nickname !== p.nickname;
        // Room navigation teleports instead of drawing a trip through walls.
        if (Math.hypot(peer.x - p.x, peer.y - p.y) > 180) {peer.x = p.x; peer.y = p.y;}
        Object.assign(peer, {targetX: p.x, targetY: p.y, dir: p.dir, color: p.color,
          moving: p.moving, nickname: p.nickname, receivedAt: now});
        return renamed;
      }
      function publish(t) {
        if (!ready || socket?.readyState !== WebSocket.OPEN || t - lastSent < 100) return;
        const state = {type: 'move', x: player.x, y: player.y, dir: player.dir,
          color: player.color, moving: player.moving};
        const encoded = JSON.stringify(state);
        if (encoded === lastState) return;
        socket.send(encoded); lastSent = t; lastState = encoded;
      }
      function connect() {
        if (closed) return;
        clearTimeout(retry);
        setStatus('연결 중…', 'connecting');
        const url = new URL(config.socketPath, window.location.href);
        url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(url.href);
        const current = socket;
        current.onmessage = event => {
          if (current !== socket || closed) return;
          let message;
          try {message = JSON.parse(event.data);} catch {return;}
          if (message.type === 'welcome' && Array.isArray(message.players)) {
            selfId = message.selfId; peers.clear();
            for (const p of message.players) upsert(p);
            ready = true; retryDelay = 1000; lastSent = -Infinity; lastState = '';
            updateRoster(); publish(performance.now());
            clearInterval(heartbeat);
            heartbeat = setInterval(() => {
              if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({type: 'ping'}));
            }, 15000);
          } else if (ready && (message.type === 'join' || message.type === 'move')) {
            if (upsert(message.player)) updateRoster();
          } else if (ready && message.type === 'leave') {
            if (peers.delete(message.id)) updateRoster();
          }
        };
        current.onclose = event => {
          if (current !== socket) return;
          ready = false; peers.clear(); roster.replaceChildren(); clearInterval(heartbeat);
          if (closed) return;
          if (event.code === 4401) {
            closed = true; setStatus('로그인이 필요해요', 'disconnected');
            onAuthExpired(); window.location.assign(config.loginUrl); return;
          }
          setStatus('연결 끊김 · 다시 연결 중…', 'disconnected');
          retry = setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 10000);
        };
        // onclose performs recovery; avoid a separate retry for the same failure.
        current.onerror = () => {};
      }
      function close() {
        closed = true; ready = false; peers.clear();
        clearTimeout(retry); clearInterval(heartbeat);
        socket?.close(1000);
      }
      window.addEventListener('pagehide', close);
      window.addEventListener('pageshow', event => {
        if (event.persisted) {closed = false; connect();}
      });
      document.getElementById('campusLogoutForm')?.addEventListener('submit', close);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !closed && socket?.readyState === WebSocket.CLOSED) connect();
      });
      connect();
      return {
        peers, close,
        tick(t, dt) {
          publish(t);
          const blend = 1 - Math.exp(-dt * 18);
          for (const peer of peers.values()) {
            peer.x += (peer.targetX - peer.x) * blend;
            peer.y += (peer.targetY - peer.y) * blend;
            if (t - peer.receivedAt > 300) peer.moving = false;
          }
        },
      };
    },
  };
})();
