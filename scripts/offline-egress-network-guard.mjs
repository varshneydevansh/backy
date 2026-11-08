// Offline regression tests may use local Unix sockets, never hosted providers.
import net from 'node:net';
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0]; if (Array.isArray(options)) options = options[0];
  if (typeof options === 'string' && options.startsWith('/') || options && typeof options === 'object' && typeof options.path === 'string') return connect.apply(this, args);
  throw new Error('Provider network is forbidden in offline egress regression tests');
};
globalThis.fetch = async () => { throw new Error('Provider fetch is forbidden in offline egress regression tests'); };
