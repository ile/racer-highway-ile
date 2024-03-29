var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;
var crypto = require('crypto');
var extend = require('extend');
var createWebSocketStream = require('./createWebSocketStream');

var bundle = require('./bundle');

var defaultServerOptions = {
  session: null,
  base: '/ws',
  noPing: false,
  pingInterval: 30000,
  perMessageDeflate: true
};

module.exports = function(backend, serverOptions, clientOptions) {

  serverOptions = serverOptions || {};
  serverOptions = extend({}, defaultServerOptions, serverOptions);

  // ws-module specific options
  serverOptions.path = serverOptions.base;
  serverOptions.noServer = true;

  // add the client side script to the Browserify bundle
  backend.on('bundle', bundle(clientOptions));

  var wss = new WebSocketServer(serverOptions);

  wss.on('connection', function (client, req) {
    client.on('error', console.error);
    client.id = crypto.randomBytes(16).toString('hex');

    // Some proxy drop out long connections
    // so do ping periodically to prevent this
    // interval = 30s by default
    if (!serverOptions.noPing){
      client.timer = setInterval(function(){

        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        } else {
          clearInterval(client.timer);
        }
      }, serverOptions.pingInterval);
    }

    var rejected = false;
    var rejectReason;

    function reject(reason) {
      rejected = true;
      if (reason) rejectReason = reason;
    }

    if (req.session) client.connectSession = req.session;

    backend.emit('client', client, reject);
    if (rejected) {
      // Tell the client to stop trying to connect
      client.close(1001, rejectReason);
      return;
    }

    var stream = createWebSocketStream(client);
    doneInitialization(backend, stream, req);

  });

  function upgrade(req, socket, upgradeHead){
    socket.on('error', console.error);
    //copy upgradeHead to avoid retention of large slab buffers used in node core
    var head = new Buffer(upgradeHead.length);
    upgradeHead.copy(head);

    if (serverOptions.session) {
      // https://github.com/expressjs/session/pull/57
      if (!req.originalUrl) req.originalUrl = req.url;
      serverOptions.session(req, {}, next);
    } else {
      next();
    }

    function next() {
      wss.handleUpgrade(req, socket, head, function(client) {
        wss.emit('connection'+req.url, client);
        wss.emit('connection', client, req);
      });
    }
  }

  if (serverOptions.session) {
    backend.use('connect',  function(shareRequest, next){
      var req = shareRequest.req;
      var agent = shareRequest.agent;

      if (!agent.connectSession && req && req.session) {
        agent.connectSession = req.session;
      }

      // TODO check if we really need the code
      // for now it doesn't work anymore
      // because sharedb 'connect' hook can work
      // only synchronously
      
      // serverOptions.session(req, {}, function(){
      //   agent.connectSession = req.session;
      //   next();
      // });

      next()
    });
  }

  return { upgrade, wss };
};

function doneInitialization(backend, stream, request){
  backend.on('connect', function(data){
    var agent = data.agent;
    if (request.session) agent.connectSession = request.session;
    backend.emit('share agent', agent, stream);
  });

  backend.listen(stream, request);
}