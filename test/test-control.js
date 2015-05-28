'use strict';

var Central = require('./mock-central');
var concat = require('concat-stream');
var debug = require('./debug');
var executor = require.resolve('../bin/sl-executor.js');
var fork = require('child_process').fork;
var tap = require('tap');

tap.test('connect', function(t) {
  var central = new Central(onRequest, onListening);
  t.on('end', central.stop.bind(central));

  function onListening(control) {
    var child = cli('--control', control);

    child.on('exit', function(code, signal) {
      debug('executor exit: %j', signal || code);
      t.equal(code, 0);
      t.end();
    });
  }

  function onRequest(req, callback) {
    debug('onRequest: %j', req);
    callback({});

    central.request({cmd: 'shutdown'}, function(rsp) {
      debug('shutdown => %j', rsp);
    });
  }

});

function cli() {
  var child = fork(executor, [].slice.call(arguments));
  return child;
}
