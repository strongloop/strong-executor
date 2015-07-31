'use strict';

var Container = require('./container');
var EventEmitter = require('events').EventEmitter;
var WebsocketChannel = require('strong-control-channel/ws-channel');
var _ = require('lodash');
var assert = require('assert');
var debug = require('./debug')('executor');
var defaults = require('strong-url-defaults');
var extend = require('./util').extend;
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
  this._svcAddr = options.svcAddr;
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
    var ip = self._channel._socket.address().address;
    var addr = self._svcAddr || ip;
    self._channel.request({
      cmd: 'starting',
      hostname: os.hostname(),
      cpus: os.cpus().length,
      address: addr,
      driver: this._driver,
    }, function(rsp) {
      debug('started: %j', rsp);
      if (callback)
      callback(null, rsp);
    });
    return callback();
  });

  self._channel.on('error', function(err) {
    debug('channel errored: %s', err.message);
    self._channel = null;
    self.emit('disconnect', err);
  });
};

Executor.prototype.stop = function(callback) {
  var self = this;

  debug('stopping executor');

  // XXX should stop containers, but they will self-exit when executor exits
  if (!this._channel) {
    setImmediate(callback);
    return;
  }

  this._channel.close(function() {
    debug('channel stopped');
    self._channel = null;
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
    req.env = extend({PORT: self._unusedPort()}, req.env);
    req.options = req.options || {};
    self._containers[req.id] = new self._Container({
      control: self._control,
      deploymentId: mandatory(req.deploymentId),
      env: mandatory(req.env),
      id: mandatory(req.id),
      options: mandatory(req.options),
      token: mandatory(req.token),
    });

    self._containers[req.id].on('exit', function(reason, pid) {
      self._channel.notify({
        cmd: 'container-exit',
        id: req.id,
        reason: reason,
        pid: pid,
      });
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
  this._containers[req.id].setStartOptions(req.options);
  return callback(OK);
};

Executor.prototype['cmd-container-set-env'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  req.env = extend({PORT: this._basePort + req.id}, req.env);
  this._containers[req.id].setEnv(req.env);
  return callback(OK);
};

Executor.prototype['cmd-container-start'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  this._containerStart(req.id, function(err) {
    return callback(err ? {error: err.message} : OK);
  });
};

Executor.prototype['cmd-container-destroy'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  this._containerDestroy(req.id, function(err) {
    return callback(err ? {message: err.message} : OK);
  });
};

Executor.prototype['cmd-container-soft-stop'] =
Executor.prototype['cmd-container-stop'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  var soft = req.cmd === 'container-soft-stop';
  this._containerStop(req.id, {soft: soft}, function(err) {
    return callback(err ? {message: err.message} : OK);
  });
};

Executor.prototype['cmd-container-soft-restart'] =
Executor.prototype['cmd-container-restart'] = function(req, callback) {
  if (!this.containerExists(req.id, callback))
    return;

  var soft = req.cmd === 'container-soft-restart';
  this._containerRestart(req.id, {soft: soft}, function(err) {
    return callback(err ? {message: err.message} : OK);
  });
};

Executor.prototype.containerExists = function(id, callback) {
  if (this._containers[id])
    return true;

  callback({error: fmt('container %s does not exist', id)});
};

Executor.prototype._containerStart = function(id, callback) {
  var container = this._containers[id];
  assert(container);
  container.start(callback);
};

Executor.prototype._containerRestart = function(id, options, callback) {
  var container = this._containers[id];
  assert(container);
  container.restart(options, callback);
};

Executor.prototype._containerDestroy = function(id, callback) {
  var container = this._containers[id];
  if (!container) return callback();

  var self = this;
  this._containerStop(id, {}, function(err) {
    delete self._containers[id];
    return callback(err);
  });
};

Executor.prototype._containerStop = function(id, options, callback) {
  var container = this._containers[id];
  assert(container);
  container.stop(options, callback);
};

Executor.prototype._unusedPort = function() {
  var used = _.pluck(this._containers, 'port');
  var port = this._basePort + 1; // TBD
  while (_.includes(used, port)) port++;
  return port;
};
