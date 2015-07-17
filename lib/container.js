'use strict';

var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var debug = require('debug');
var defaults = require('strong-url-defaults');
var extend = require('./util').extend;
var fmt = require('util').format;
var fork = require('child_process').fork;
var mandatory = require('./util').mandatory;
var path = require('path');
var pump = require('pump');
var request = require('request');
var run = require.resolve('strong-supervisor/bin/sl-run');
var tar = require('tar');
var url = require('url');
var util = require('util');
var zlib = require('zlib');

module.exports = Container;

function Container(args) {
  EventEmitter.call(this);

  this._id = mandatory(args.id);
  this._execToken = url.parse(mandatory(args.control)).auth;
  this._env = mandatory(args.env);
  this._options = mandatory(args.options);
  this._fork = args.fork || fork;

  var instance = mandatory(args.id);
  var deployment = mandatory(args.deploymentId);
  var downloadPath = fmt('artifacts/executor/%s/%s', instance, deployment);
  this.containerDir = path.resolve('containers', String(mandatory(args.id)));
  this.downloadUrl = defaults(args.control, {}, {
    protocol: 'http',
    auth: null,
    path: downloadPath
  });
  this.controlUrl = defaults(args.control, {}, {
    protocol: 'http',
    auth: mandatory(args.token),
    path: null,
  });

  this.debug = debug('strong-executor:container:' + args.id);
  this.debug('Container %j', args);
}
util.inherits(Container, EventEmitter);

Container.prototype.setEnv = function(env) {
  var self = this;

  this.debug('setEnv %j', env);
  this._env = env;
  this.restart({soft: true}, function(err) {
    if (err)
      return self.debug('Error restarting with new env. %s', err.message);
    self.debug('Restarted with new env');
  });
};

Container.prototype.setStartOptions = function(options) {
  this.debug('setOptions %j', options);
  this._options = options;
};

Container.prototype.start = function(callback) {
  async.series([
    this._download.bind(this),
    this._run.bind(this),
  ], callback);
};

Container.prototype._download = function(callback) {
  var self = this;
  var requestOptions = {
    url: self.downloadUrl,
    headers: {
      'x-mesh-token': self._execToken,
    }
  };
  var tarOptions = {
    path: self.containerDir,
    strip: 1,
  };

  self.debug('download: %j', requestOptions);
  self.debug('untar to: %j', tarOptions);

  var get = request.get(requestOptions);

  get.on('error', done);
  get.on('response', function(rsp) {
    var code = rsp.statusCode;
    self.debug('download response: code %j', code);

    if (code !== 200) {
      // XXX(sam) download response body and print it, it will contain
      // info on why failure occurred
      return done(new Error(fmt('status code %d', code)));
    }

    pump(
      get,
      zlib.createGunzip(),
      tar.Extract(tarOptions),
      done
    );
  });

  function done(err) {
    self.debug('download done: err? %s', err);
    if (err)
      console.error('Container download failed: %s', err.message);
    return callback(err);
  }
};

Container.prototype._run = function(callback) {
  var args = [
    fmt('--cluster=%s', this._options.size),
    fmt('--control=%s', this.controlUrl),
  ];

  if (this._options.trace) {
    args.push('--trace');
  }

  args.push(this.containerDir);

  this.debug('run %s: %j', run, args);

  var env = extend(this._env, {
    STRONGLOOP_LICENSE: process.env.STRONGLOOP_LICENSE,
    DEBUG: process.env.DEBUG,
    PATH: process.env.PATH,
  });
  this.debug('env: %j', run, this._env);

  this._proc = this._fork(run, args, {
    env: env,
  }).on('error', function(err) {
    // Unhandleable, it means supervisor isn't present.
    assert.ifError(err, fmt('fork failed: %s', err.message));
  });
  this.debug('forked pid %d', this._proc.pid);

  var self = this;
  var pid = this._proc.pid;
  this._proc.on('exit', function(code, signal) {
    var reason = signal || code;
    self.debug('emitting container exit notification');
    self.emit('exit', reason, pid);
  });
  this._proc.on('exit', this._restart.bind(this));

  if (callback) return callback();
};

Container.prototype._restart = function(code, signal) {
  var reason = signal || code;

  this.debug('runner exit with %s expected? %j', reason, !this._proc);

  if (!this._proc) {
    this.debug('container ready for cleanup');
    return; // Exit because we are destroying the child, do not restart.
  }

  console.error('Restarting instance %d: unexpected exit with %s',
    this._id, reason);

  this._run();
};

Container.prototype.restart = function(options, callback) {
  var self = this;
  this.stop(options, function(err) {
    if (err) return callback(err);
    self.start(callback);
  });
};

Container.prototype.stop = function(options, callback) {
  var self = this;
  var timeoutHandle = null;

  if (callback === null && typeof options === 'function') {
    callback = options;
    options = {};
  }
  assert(callback);

  if (!self._proc)
    return setImmediate(callback);

  // During a soft-stop, Central sends a message to supervisor asking to exit
  // gracefully, and informs executor about the soft-stop. If supervisor does
  // not exit in time, executor should terminate it.
  if (options.soft) {
    timeoutHandle = setTimeout(function() {
      self.debug('soft-stop timed out. hard-stopping');
      self.stop({}, function(err, reason) {
        if (err) self.debug('Unable to kill container: %s', err.message);
        self.debug('container was hard-stopped: %s', reason);

        // Normally the `exit` handler would call the callback, this case would
        // only occur if the hard-stop fails.
        if (callback && err) {
          callback(err);
          callback = null;
        }
      });
      timeoutHandle = null;
    }, options.timeout || 5000);
  } else if (!self._proc.kill('SIGTERM')) {
    return setImmediate(callback); // Already died
  }

  self._proc.once('exit', function(code, signal) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    var reason = signal || code;
    self.debug('stopped with reason: %s', reason);
    if (callback) callback(null, reason);
    callback = null;
  });

  self._proc = null;
};
