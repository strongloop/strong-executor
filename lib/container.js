var request = require('request');
var tar = require('tar');
var zlib = require('zlib');
var util = require('util');
var path = require('path');
var exec = require('child_process').exec;
var debug = require('debug')('container');

// Extend base without modifying it.
function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
}

function Container(id, execToken, token, env, startOptions, deploymentId) {
  this._id = id;
  this._execToken = execToken;
  this._token = token;
  this._env = env || {};
  this._startOptions = startOptions || {};
  this._deploymentId = deploymentId;
  debug('Container %j', this);
}
module.exports = Container;

function setEnv(env) {
  this._env = env;
  debug('setEnv %j', this);
}
Container.prototype.setEnv = setEnv;

function setStartOptions(options) {
  this._startOptions = options;
  debug('setStartOptions %j', this);
}
Container.prototype.setStartOptions = setStartOptions;

function setDeployment(deploymentId) {
  this._deploymentId = deploymentId;
  debug('setDeployment %j', this);
}
Container.prototype.setDeployment = setDeployment;

function download() {
  debug('download %j', this);
  if (!this._deploymentId) {
    debug('skipping download. Rev %s already running', this._deploymentId);
    this.start();
    return;
  }

  var self = this;
  var options = {
    url: util.format(
      'http://127.0.0.1:8701/artifacts/executor/%s/%s',
      this._id, this._deploymentId
    ), headers: {
      'x-mesh-token': this._execToken
    }
  };
  debug(options);

  var containerDir = path.join('/tmp', 'containers', String(this._id));

  var tarOptions = {
    path: containerDir,
    strip: 1,
  };
  var unzipStream = zlib.createGunzip();
  var untarStream = tar.Extract(tarOptions);
  var readStream = request.get(options);

  readStream.pipe(unzipStream).pipe(untarStream);

  readStream.on('error', function(err) {
    debug('Read failed with: %s', err);
  });
  unzipStream.on('error', function(err) {
    debug('Untar failed with: %s', err);
  });
  untarStream.on('error', function(err) {
    debug('Untar failed with: %s', err);
  });

  untarStream.on('end', function() {
    debug('done untgz into %s', containerDir);
    self.restart();
  });
}
Container.prototype.download = download;

function start() {
  if (this._proc) {
    return;
  }
  this.restart();
}
Container.prototype.start = start;

function restart() {
  debug('restart %j', this);
  if (this._proc) {
    this._proc.kill();
    this._proc = null;
  }

  var cmd = util.format(
    '%s %s --cluster=%s %s -C http://%s@%s',
    '/usr/local/bin/node',
    '/usr/local/bin/sl-run',
    this._startOptions.size,
    this._startOptions.trace? '--trace' : '',
    this._token,
    '127.0.0.1:8701/supervisor-control'
  );
  debug(cmd);

  var env = extend(this._env, {
    STRONGLOOP_LICENSE: process.env.STRONGLOOP_LICENSE,
    DEBUG: process.env.DEBUG,
    PATH: process.env.PATH,
  });
  debug(env);

  var containerDir = path.join('/tmp', 'containers', String(this._id));
  this._proc = exec(cmd, {
    cwd: containerDir,
    env: env,
  });
  debug('Proc started: %s', this._proc.pid);

  this._proc.stdout.pipe(process.stdout);
  this._proc.stderr.pipe(process.stderr);
}
Container.prototype.restart = restart;

function kill() {
  debug('restart %j', this);
  if (this._proc) {
    this._proc.kill();
    this._proc = null;
  }
}
Container.prototype.restart = restart;
