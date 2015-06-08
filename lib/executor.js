'use strict';

var WebsocketChannel = require('strong-control-channel/ws-channel');
var debug = require('./debug')('executor');
var defaults = require('strong-url-defaults');
var os = require('os');
var util = require('util');

module.exports = Executor;

function Executor(options) {
  options = util._extend({
    console: console,
  }, options);

  this.console = options.console || console;
  this._driver = options.driver || 'direct';
  this._control = defaults(options.control, {}, {
    protocol: 'ws',
    path: 'executor-control',
  });
}

Executor.prototype.start = function() {
  var self = this;

  debug('start - connect to %j with %s', this._control);

  self._channel = WebsocketChannel.connect(
    self._onRequest.bind(self),
    self._control,
    self._token
  );

  self._channel.request({
    cmd: 'starting',
    hostname: os.hostname(),
    cpus: os.cpus(),
    driver: this._driver,
  }, function(rsp) {
    debug('started: %j', rsp);
  });
};

Executor.prototype.stop = function(callback) {
  debug('stopping channel');
  this._channel.close(function() {
    debug('channel stopped');
    if (callback) callback();
  });
};

Executor.prototype._onRequest = function(req, callback) {
  var cmd = req.cmd;
  delete req.cmd;

  debug('onRequest: cmd %s %j', cmd, req);

  switch (cmd) {
    case 'shutdown':
      // FIXME even after channel stop, node is held open - ws or channel bug?
      setImmediate(this.stop.bind(this, process.exit));
      return callback({message: 'shutting down'});
    case 'container-create':
      console.log('sl-run --cluster 1 -C http://%s@127.0.0.1:8701', req.token);
      return callback({
        driverMeta: {},
        container: {
          type: 'strong-executor',
          version: require('../package.json').version,
        }
      });
    default:
      return callback({error: 'unsupported command: ' + cmd});
  }
};
