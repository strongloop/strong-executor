var EventEmitter = require('events').EventEmitter;
var Executor = require('../lib/executor');
var os = require('os');
var tap = require('tap');
var util = require('util');

tap.test('executor', function(t) {
  var Channel;
  var e;

  function Container(options) {
    EventEmitter.call(this);

    Container.options = options;
    return Container;
  }
  util.inherits(Container, EventEmitter);

  Container.start = function(cb) {
    setImmediate(cb);
  };

  Container.destroy = function(cb) {
    setImmediate(cb);
  };

  t.test('start', function(t) {
    Channel = {
      connect: function(onRequest, uri) {
        this.onRequest = onRequest;

        t.equal(uri, e._control);
        return this;
      },
      request: function(req, cb) {
        t.match(req, {
          cmd: 'starting',
          hostname: os.hostname(),
          cpus: os.cpus().length,
          driver: 'direct',
        });
        setImmediate(cb.bind(null, {message: 'OK'}));
      },
      close: function(cb) {
        setImmediate(cb);
      },
      on: function(onError) {
        this.onError = onError;
      },
    };

    e = new Executor({
      Channel: Channel,
      Container: Container,
      basePort: 4000,
      control: 'http://token@host:66',
    });

    t.equal(e._control, 'ws://token@host:66/executor-control');

    e.start(function(err, rsp) {
      t.ifError(err);
      t.equal(rsp.message, 'OK');
      t.end();
    });
  });

  t.test('stop', function(t) {
    e.stop(function() {
      t.ok(true, 'closed');
      t.end();
    });
  });

  t.test('cmd shutdown', function(t) {
    var _exit = process.exit;

    process.exit = function() {
      t.end();
      process.exit = _exit;
    };

    Channel.onRequest({cmd: 'shutdown'}, function(rsp) {
      t.equal(rsp.message, 'shutting down');
    });
  });

  t.test('cmd container-destroy non-existent', function(t) {
    Channel.onRequest({cmd: 'container-destroy'}, function(rsp) {
      t.equal(rsp.message, undefined);
      t.assert(rsp.error);
      t.end();
    });
  });

  t.test('cmd container-set-env non-existent', function(t) {
    Channel.onRequest({cmd: 'container-set-env', id: -9}, function(rsp) {
      t.equal(rsp.message, undefined);
      t.assert(rsp.error);
      t.end();
    });
  });

  t.test('cmd container-set-options non-existent', function(t) {
    Channel.onRequest({cmd: 'container-set-options', id: -9}, function(rsp) {
      t.equal(rsp.message, undefined);
      t.assert(rsp.error);
      t.end();
    });
  });

  t.test('cmd invalid', function(t) {
    Channel.onRequest({cmd: 'no-such-command'}, function(rsp) {
      t.equal(rsp.error, 'unsupported command "no-such-command"');
      t.end();
    });
  });

  t.test('cmd container-deploy and create', function(t) {
    var req = {
      cmd: 'container-deploy',
      deploymentId: 'DID',
      env: {HI: 'there'},
      id: 3,
      options: {size: 5},
      token: 'TOKEN',
    };

    Container.on = function() {};

    Container.start = function(cb) {
      var o = Container.options;
      t.equal(o.control, e._control);
      t.equal(o.deploymentId, req.deploymentId);
      t.equal(o.env.HI, req.env.HI);
      t.equal(o.env.PORT, 4000 + req.id);
      t.equal(o.options.size, req.options.size);
      t.equal(o.token, req.token);
      setImmediate(cb);
    };

    t.plan(10);

    Channel.onRequest(req, function(rsp) {
      t.equal(rsp.error, undefined);
      t.equal(rsp.container.type, 'strong-executor');
      t.equal(rsp.container.version, require('../package.json').version);
      t.deepEqual(rsp.driverMeta, {});
      t.end();
    });
  });

  t.test('cmd container-deploy and replace', function(t) {
    var req = {
      cmd: 'container-deploy',
      deploymentId: 'XYZ',
      env: {HI: 'you'},
      id: 3,
      options: {size: 2},
      token: 'OTHER',
    };

    Container.on = function() {};

    Container.start = function(cb) {
      var o = Container.options;
      t.equal(o.control, e._control, 'control');
      t.equal(o.deploymentId, req.deploymentId);
      t.equal(o.env.HI, req.env.HI);
      t.equal(o.options.size, req.options.size);
      t.equal(o.token, req.token);
      setImmediate(cb);
    };

    Container.stop = function(options, cb) {
      t.equal(this.options.deploymentId, 'DID', 'stop old');
      setImmediate(cb);
    };

    t.plan(10);

    Channel.onRequest(req, function(rsp) {
      t.equal(rsp.error, undefined, 'no error');
      t.equal(rsp.container.type, 'strong-executor');
      t.equal(rsp.container.version, require('../package.json').version);
      t.deepEqual(rsp.driverMeta, {});
      t.end();
    });
  });

  testStop('container-stop');
  testStop('container-stop', 'no worky');
  testStop('container-soft-stop');
  testStop('container-soft-stop', 'failing');

  testRestart('container-restart');
  testRestart('container-restart', 'no worky');
  testRestart('container-soft-restart');
  testRestart('container-soft-restart', 'failing');

  function testStop(cmd, rspError) {
    return testHardSoft('stop', cmd, rspError);
  }

  function testRestart(cmd, rspError) {
    return testHardSoft('restart', cmd, rspError);
  }

  function testHardSoft(method, cmd, rspError) {
    var name = util.format('cmd %s %s', cmd, rspError ? 'error' : 'ok');
    var soft = /soft/.test(cmd);
    var cbErr = rspError ? new Error(rspError) : null;
    var rspMessage = rspError ? rspError : 'ok';

    t.test(name, function(t) {
      var req = {
        cmd: cmd,
        id: 3,
      };

      Container[method] = function(options, cb) {
        t.equal(options.soft, soft, 'soft vs hard');
        setImmediate(cb.bind(null, cbErr));
      };

      t.plan(3);

      Channel.onRequest(req, function(rsp) {
        t.equal(rsp.error, undefined);
        t.equal(rsp.message, rspMessage);
        t.end();
      });
    });
  }

  t.test('cmd container-set-env default PORT', function(t) {
    var env = {
      X: 'y',
    };

    Container.setEnv = function(_) {
      t.equal(_.PORT, 4000 + 3);
      t.equal(_.X, env.X);
    };

    t.plan(3);

    var req = {cmd: 'container-set-env', env: env, id: 3};
    Channel.onRequest(req, function(rsp) {
      t.equal(rsp.message, 'ok');
    });
  });

  t.test('cmd container-set-env user PORT', function(t) {
    var env = {
      X: 'y',
      PORT: '303',
    };

    Container.setEnv = function(_) {
      t.equal(_.PORT, env.PORT);
      t.equal(_.X, env.X);
    };

    t.plan(3);

    var req = {cmd: 'container-set-env', env: env, id: 3};
    Channel.onRequest(req, function(rsp) {
      t.equal(rsp.message, 'ok');
    });
  });

});
