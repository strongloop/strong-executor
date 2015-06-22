'use strict';

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
var zlib = require('zlib');

module.exports = Container;

function Container(args) {
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
  this.debug('Container %j', this);
}

Container.prototype.setEnv = function(env) {
  this.debug('setEnv %j', env);
  this._env = env;
};

Container.prototype.setStartOptions = function(options) {
  this.debug('setOptions %j', options);
  this._options = options;
};

Container.prototype.start = function(callback) {
  async.series([
    this.download.bind(this),
    this.run.bind(this),
  ], callback);
};

Container.prototype.download = function(callback) {
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

Container.prototype.run = function(callback) {
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
    console.error('Fork failed: %s', err.message);
    return callback(err);
  });
  this.debug('forked pid %d', this._proc.pid);
  return callback();
};

Container.prototype.destroy = function(callback) {
  var self = this;

  self.destroyed = true;

  if (!self._proc)
    return setImmediate(callback);

  if (!self._proc.kill('SIGTERM'))
    return setImmediate(callback); // Already died

  self._proc.once('exit', function(code, signal) {
    var reason = signal || code;
    self.debug('destroyed with reason: %s', reason);
    return callback(reason);
  });
};
