const racer = require('aamu-racer')
const Socket = require('./socket')
const defaultClientOptions = {
  base: '/ws',
  reconnect: true,
  srvProtocol: undefined,
  srvHost: undefined,
  srvPort: undefined,
  srvSecurePort: undefined,
  timeout: 10000,
  timeoutIncrement: 10000
};

module.exports = function(clientOptions) {
  racer.Model.prototype._createSocket = function (bundle) {
    return new Socket(Object.assign(defaultClientOptions, clientOptions));
  }
}
