const BROKER = 'wss://demo.tbmq.io/mqtt';
const USERNAME = 'demo';

export function joinRoom(config, roomId, opts = {}) {
  if (!window.mqtt) throw new Error('MQTT.js is not loaded');

  const appId = String(config?.appId || 'bm-review');
  const peerId = `p-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const base = `bmreview/${appId}/${String(roomId).toUpperCase()}`;
  const client = window.mqtt.connect(BROKER, {
    clientId: `bm-${peerId}-${Date.now().toString(36)}`,
    username: USERNAME,
    clean: true,
    reconnectPeriod: 1200,
    connectTimeout: 8000,
    keepalive: 20,
    protocolVersion: 4
  });

  const actions = new Map();
  const peers = new Map();
  let onPeerJoin = null;
  let onPeerLeave = null;
  let heartbeat = null;
  let sweep = null;

  const parse = payload => {
    try { return JSON.parse(payload.toString()); }
    catch { return null; }
  };

  const markPeer = id => {
    if (!id || id === peerId) return;
    const existed = peers.has(id);
    peers.set(id, Date.now());
    if (!existed && typeof onPeerJoin === 'function') onPeerJoin(id);
  };

  const publishPresence = () => {
    if (client.connected) {
      client.publish(`${base}/$presence`, JSON.stringify({ peerId, ts: Date.now() }), { qos: 0 });
    }
  };

  client.on('connect', () => {
    client.subscribe([`${base}/action/+`, `${base}/$presence`, `${base}/$leave`], { qos: 1 }, err => {
      if (err) opts.onJoinError?.({ error: err });
      else publishPresence();
    });
    clearInterval(heartbeat);
    heartbeat = setInterval(publishPresence, 2000);
    clearInterval(sweep);
    sweep = setInterval(() => {
      const now = Date.now();
      for (const [id, seen] of peers) {
        if (now - seen > 8000) {
          peers.delete(id);
          if (typeof onPeerLeave === 'function') onPeerLeave(id);
        }
      }
    }, 3000);
  });

  client.on('error', error => opts.onJoinError?.({ error }));

  client.on('message', (topic, payload) => {
    const msg = parse(payload);
    if (!msg) return;

    if (topic === `${base}/$presence`) {
      markPeer(msg.peerId);
      return;
    }

    if (topic === `${base}/$leave`) {
      if (msg.peerId && peers.delete(msg.peerId) && typeof onPeerLeave === 'function') onPeerLeave(msg.peerId);
      return;
    }

    const prefix = `${base}/action/`;
    if (!topic.startsWith(prefix)) return;
    if (msg.sender === peerId) return;
    if (msg.target && msg.target !== peerId) return;
    markPeer(msg.sender);
    const name = topic.slice(prefix.length);
    const action = actions.get(name);
    if (action?.onMessage) action.onMessage(msg.data, { peerId: msg.sender });
  });

  const room = {
    makeAction(name) {
      if (actions.has(name)) return actions.get(name);
      const action = {
        onMessage: null,
        send(data, sendOpts = {}) {
          return new Promise((resolve, reject) => {
            const envelope = JSON.stringify({
              sender: peerId,
              target: sendOpts?.target || null,
              data
            });
            const sendNow = () => client.publish(`${base}/action/${name}`, envelope, { qos: 1 }, err => err ? reject(err) : resolve());
            if (client.connected) sendNow();
            else {
              const timer = setTimeout(() => reject(new Error('Broker connection timeout')), 9000);
              client.once('connect', () => { clearTimeout(timer); sendNow(); });
            }
          });
        }
      };
      actions.set(name, action);
      return action;
    },
    leave() {
      clearInterval(heartbeat);
      clearInterval(sweep);
      if (client.connected) client.publish(`${base}/$leave`, JSON.stringify({ peerId }), { qos: 0 });
      client.end(true);
    }
  };

  Object.defineProperty(room, 'onPeerJoin', {
    get: () => onPeerJoin,
    set: fn => {
      onPeerJoin = fn;
      if (typeof fn === 'function') for (const id of peers.keys()) queueMicrotask(() => fn(id));
    }
  });

  Object.defineProperty(room, 'onPeerLeave', {
    get: () => onPeerLeave,
    set: fn => { onPeerLeave = fn; }
  });

  return room;
}
