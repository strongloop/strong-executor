// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-executor
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var concat = require('concat-stream');
var debug = require('./debug');
var executor = require.resolve('../bin/sl-executor.js');
var fork = require('child_process').fork;
var tap = require('tap');

tap.test('version,--version', function(t) {
  var version = require('../package.json').version;

  cli('--version').stdout.pipe(concat({encoding: 'string'}, function(line) {
    debug('line <%s>', line);
    t.equal(line.trim(), version);
    t.end();
  }));
});

tap.test('version,-v', function(t) {
  var version = require('../package.json').version;

  cli('-v').stdout.pipe(concat({encoding: 'string'}, function(line) {
    debug('line <%s>', line);
    t.equal(line.trim(), version);
    t.end();
  }));
});

tap.test('help', function(t) {
  cli('-h').stdout.pipe(concat({encoding: 'string'}, function(line) {
    debug('line <%s>', line);
    t.match(line, /usage:/);
    t.end();
  }));
});

function cli() {
  var child = fork(executor, [].slice.call(arguments), {silent: true});

  child.stderr.pipe(process.stderr);

  return child;
}
