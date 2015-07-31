var Container = require('../lib/container');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('strong-executor:test');
var fmt = require('util').format;
var fs = require('fs');
var http = require('http');
var path = require('path');
var pump = require('pump');
var tap = require('tap');
var url = require('url');
var util = require('util');

function MockProcess(pid) {
  EventEmitter.call(this);
  this.pid = pid;
}
util.inherits(MockProcess, EventEmitter);

MockProcess.prototype.kill = function(sig) {
  var self = this;
  setImmediate(function() {
    self.emit('exit', 'signalled', sig);
  });
  return true;
};

tap.test('constructor', function(t) {
  var ws = 'ws://exec-token@some.host:8765/executor-control';
  var downloadUrl = 'http://some.host:8765/artifacts/executor/3/12345';
  var controlUrl = 'http://sched-token@some.host:8765';
  var c = new Container({
    control: ws,
    deploymentId: 12345,
    env: {PORT: '3003'},
    id: 3,
    options: {size: 'CPU'},
    token: 'sched-token',
  });

  t.equal(c.downloadUrl, downloadUrl);
  t.equal(c.controlUrl, controlUrl);

  c.setStartOptions({trace: true});
  t.equal(c._options.trace, true);
  t.equal(c.port, 3003);

  t.end();
});

tap.test('download', function(t) {
  t.plan(7);

  http.createServer().listen(0, '127.0.0.1', function() {
    var port = this.address().port;
    var ws = fmt('ws://exec-token@127.0.0.1:%d/executor-control', port);
    var ctl = fmt('http://sched-token@127.0.0.1:%d', port);
    this.unref();
    return new Container({
      control: ws,
      deploymentId: 12345,
      env: {PORT: 3003},
      fork: fork,
      id: 3,
      options: {size: '9'},
      token: 'sched-token',
    }).start(function(err) {
      t.ifError(err);
      t.end();
    });
    function fork(mod, args, options) {
      debug('fork mod %j', mod);
      debug('fork args %j', args);
      debug('fork options %j', options);

      t.match(mod, /sl-run.js$/);
      t.equal(args[0], '--cluster=9');
      t.match(args[1], RegExp('--control=' + ctl));

      var package = require(path.join(args[2], 'package.json'));
      t.equal(package.name, 'express-example-app');

      return {
        on: function() {
          return this;
        },
        pid: 9876,
      };
    }
  }).on('request', function(req, res) {
    debug('headers: %j', req.headers);

    t.equal(req.headers['x-mesh-token'], 'exec-token');
    t.equal(url.parse(req.url).path, '/artifacts/executor/3/12345');

    pump(fs.createReadStream(path.resolve(__dirname, 'package.tgz')), res);
  });
});

tap.test('stop', function(t) {
  var ws = 'ws://exec-token@some.host:8765/executor-control';
  var container = new Container({
    control: ws,
    deploymentId: 12345,
    env: {PORT: 3003},
    fork: fork,
    id: 3,
    options: {size: 9},
    token: 'sched-token',
  });

  container._download = function(callback) {
    callback();
  };

  var expectFork = true;
  container.start(function(err) {
    t.ifError(err);

    // should not restart
    expectFork = false;
    container.stop({}, function(err, reason) {
      t.ifError(err);
      t.equal(reason, 'SIGTERM');
      t.end();
    });
  });

  var pid = 9876;
  function fork() {
    t.assert(expectFork, 'should new process be forked? ' + expectFork);
    return new MockProcess(pid++);
  }
});

tap.test('restart', function(t) {
  var ws = 'ws://exec-token@some.host:8765/executor-control';
  var pid = 9876;
  var container = new Container({
    control: ws,
    deploymentId: 12345,
    env: {PORT: 3003},
    fork: fork,
    id: 3,
    options: {size: 9},
    token: 'sched-token',
  });

  container._download = function(callback) {
    callback();
  };

  var expectFork = true;
  container.start(function(err) {
    t.ifError(err);
    t.equal(pid, 9877);

    // should not restart
    expectFork = true;
    container.restart({}, function(err) {
      t.ifError(err);
      t.equal(pid, 9878);
      t.end();
    });
  });

  function fork() {
    t.assert(expectFork, 'should new process be forked? ' + expectFork);
    return new MockProcess(++pid);
  }
});

tap.test('soft-stop (successful)', function(t) {
  var ws = 'ws://exec-token@some.host:8765/executor-control';
  var container = new Container({
    control: ws,
    deploymentId: 12345,
    env: {PORT: 3003},
    fork: fork,
    id: 3,
    options: {size: 9},
    token: 'sched-token',
  });

  container._download = function(callback) {
    callback();
  };

  var expectFork = true;
  container.start(function(err) {
    t.ifError(err);

    // should not restart
    expectFork = false;
    process.nextTick(function() {
      proc.emit('exit', 'soft-stopped', null);
    });

    container.stop({soft: true, timeout: 1000}, function(err, reason) {
      t.ifError(err);
      t.equal(reason, 'soft-stopped');
      t.end();
    });
  });

  var pid = 9876;
  var proc = null;
  function fork() {
    t.assert(expectFork, 'should new process be forked? ' + expectFork);
    proc = new MockProcess(pid++);
    return proc;
  }
});

tap.test('soft-stop (timeout)', function(t) {
  var ws = 'ws://exec-token@some.host:8765/executor-control';
  var container = new Container({
    control: ws,
    deploymentId: 12345,
    env: {PORT: 3003},
    fork: fork,
    id: 3,
    options: {size: 9},
    token: 'sched-token',
  });

  container._download = function(callback) {
    callback();
  };

  var expectFork = true;
  container.start(function(err) {
    t.ifError(err);

    // should not restart
    expectFork = false;
    container.stop({soft: true, timeout: 50}, function(err, reason) {
      t.ifError(err);
      t.equal(reason, 'SIGTERM');
      t.end();
    });
  });

  var pid = 9876;
  function fork() {
    t.assert(expectFork, 'should new process be forked? ' + expectFork);
    return new MockProcess(pid++);
  }
});

tap.test('setEnv', function(t) {
  var ws = 'ws://exec-token@some.host:8765/executor-control';
  var c = new Container({
    control: ws,
    deploymentId: 12345,
    env: {PORT: 3003},
    id: 3,
    options: {size: 'CPU'},
    token: 'sched-token',
  });
  var env = {
    this: 'that',
    PORT: '3005',
  };

  t.plan(4);

  c.restart = function(options, cb) {
    t.false(options.soft, 'hard restart');
    // FIXME if this is in setImmediate/nextTick, tap exits immediately with 0,
    // before calling the callback. A mystery, but not a problem for this test.
    // setImmediate(function() {
    cb(new Error('fu'));
    //});
  };

  c.setEnv(env, function(err) {
    t.equal(c._env, env, 'env set');
    t.equal(err.message, 'fu', 'error pass-thru');
    t.equal(c.port, 3005, 'port');
    t.end();
  });
});

// XXX tap.test
// - start()
// - destroy()
// - restart on unexpected exit
