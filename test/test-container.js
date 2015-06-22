var Container = require('../lib/container');
var debug = require('debug')('strong-executor:test');
var fmt = require('util').format;
var fs = require('fs');
var http = require('http');
var path = require('path');
var pump = require('pump');
var tap = require('tap');
var url = require('url');

tap.test('constructor', function(t) {
  var ws = 'ws://exec-token@some.host:8765/executor-control';
  var downloadUrl = 'http://some.host:8765/artifacts/executor/3/12345';
  var controlUrl = 'http://sched-token@some.host:8765';
  var c = new Container({
    control: ws,
    deploymentId: 12345,
    env: {PORT: 3003},
    id: 3,
    options: {size: 'CPU'},
    token: 'sched-token',
  });

  t.equal(c.downloadUrl, downloadUrl);
  t.equal(c.controlUrl, controlUrl);

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
