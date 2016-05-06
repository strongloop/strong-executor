// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-executor
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Central = require('./mock-central');
var debug = require('./debug');
var executor = require.resolve('../bin/sl-executor.js');
var fork = require('child_process').fork;
var tap = require('tap');

tap.test('connect', function(t) {
  var central = new Central(onRequest, onListening);

  central.client.on('new-channel', function(channel) {
    channel.on('error', function(err) {
      t.equal(err.message, 'disconnect');
    });
  });

  function onListening(control) {
    var child = cli('--control', control);

    child.on('exit', function(code, signal) {
      debug('executor exit: %j', signal || code);
      t.equal(code, 1);
      t.end();
    });
  }

  function onRequest(req) {
    debug('onRequest: %j', req);
    central.stop();
  }

});

function cli() {
  var child = fork(executor, [].slice.call(arguments));
  return child;
}
