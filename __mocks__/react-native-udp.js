const { EventEmitter } = require('events');

class MockUdpSocket extends EventEmitter {
  bind(...args) {
    const callback = args.find(a => typeof a === 'function');
    setImmediate(() => {
      this.emit('listening');
      if (callback) callback();
    });
  }

  setBroadcast() {}

  send(msg, offset, length, port, address, callback) {
    setImmediate(() => {
      if (callback) callback();
    });
  }

  close(callback) {
    if (callback) callback();
  }

  address() {
    return { address: '0.0.0.0', port: 0, family: 'IPv4' };
  }
}

module.exports = {
  __esModule: true,
  default: {
    createSocket: jest.fn(() => new MockUdpSocket()),
    Socket: MockUdpSocket,
  },
};
