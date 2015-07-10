'use strict';

var Container = require('./container');
var EventEmitter = require('events').EventEmitter;
var WebsocketChannel = require('strong-control-channel/ws-channel');
var debug = require('./debug')('executor');
var defaults = require('strong-url-defaults');
var fmt = require('util').format;
var mandatory = require('./util').mandatory;
var os = require('os');
var util = require('util');

module.exports = Executor;

function Executor(options) {
  EventEmitter.call(this);

  options = util._extend({
    console: console,
  }, options);

  this._Container = options.Container || Container;
  this._Channel = options.Channel || WebsocketChannel;
  this._basePort = options.basePort || 3000;
  this.console = options.console || console;
  this._driver = options.driver || 'direct';
  this._control = defaults(options.control, {}, {
    protocol: 'ws',
    path: 'executor-control',
  });

  this._containers = {};
}

util.inherits(Executor, EventEmitter);

Executor.prototype.start = function(callback) {
  var self = this;

  debug('start - connect to %j', this._control);

  self._channel = this._Channel.connect(
    self._onRequest.bind(self),
    self._control
  );

  self._channel.on('connect', function() {
    debug('start: connected');
    return callback();
  });

  self._channel.on('error', function(err) {
    debug('channel errored: %s', err.message);
    self.emit('disconnect', err);
  });

  self._channel.request({
    cmd: 'starting',
    hostname: os.hostname(),
    cpus: os.cpus().length,
    driver: this._driver,
  }, function(rsp) {
    debug('started: %j', rsp);
    if (callback)
      callback(null, rsp);
  });
};

Executor.prototype.stop = function(callback) {
  debug('stopping executor');

  // XXX should stop containers, but they will self-exit when executor exits
  if (!this._channel)
    setImmediate(callback);

  this._channel.close(function() {
    debug('channel stopped');
    if (callback) callback();
  });
};

Executor.prototype._onRequest = function(req, callback) {
  var cmd = this['cmd-' + req.cmd] || onUndefined;

  debug('onRequest: cmd %s %j exist? %j', req.cmd, req, !!cmd);

  cmd.call(this, req, callback); // wrap callback and debug print it

  function onUndefined() {
    return callback({error: fmt('unsupported command %j', req.cmd)});
  }
};

var OK = {message: 'ok'};

Executor.prototype['cmd-shutdown'] = function(req, callback) {
  setImmediate(this.stop.bind(this, process.exit));
  return callback({message: 'shutting down'});
};

Executor.prototype['cmd-container-deploy'] = function(req, callback) {
  var self = this;

  self._containerDestroy(req.id, function() {
    req.env = req.env || {};
    req.options = req.options || {};
    req.env.PORT = 3000 + req.id;
    self._containers[req.id] = new self._Container({
      control: self._control,
      deploymentId: mandatory(req.deploymentId),
      env: mandatory(req.env),
      id: mandatory(req.id),
      options: mandatory(req.options),
      token: mandatory(req.token),
    });
    // XXX should we return to the caller before the container is deployed?
    self._containers[req.id].start(function(err) {
      if (err)
        console.error('Start container %d failed: %s', req.id, err.message);
      // XXX and tell central?
    });
    return callback({
      // XXX(sam) not clear what the difference is... container meta looks like
      // driverMeta to me.
      driverMeta: {},
      container: {
        type: 'strong-executor',
        version: require('../package.json').version,
      }
    });
  });
};

Executor.prototype['cmd-container-set-options'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  req.options = req.options || {};
  this._containers[req.id].setOptions(req.options);
  return callback(OK);
};

Executor.prototype['cmd-container-set-env'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  req.env = req.env || {};
  req.env.PORT = 3000 + req.id;
  this._containers[req.id].setEnv(req.env);
  return callback(OK);
};

Executor.prototype['cmd-container-destroy'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  this._containerDestroy(req.id, function(err) {
    return callback(err ? {message: err.message} : OK);
  });
};

Executor.prototype.containerExists = function(id, callback) {
  if (this._containers[id])
    return true;

  callback({error: fmt('container %s does not exist', id)});
};

Executor.prototype._containerDestroy = function(id, callback) {
  var container = this._containers[id];
  delete this._containers[id];

  debug('destroy %d exist? %j', id, !!container);

  if (!container)
    return setImmediate(callback);

  container.destroy(callback);
};
