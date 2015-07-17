'use strict';

var exec = require('child_process').exec;
var fmt = require('util').format;
var install = require('../bin/sl-executor-install');
var path = require('path');
var tap = require('tap');

var user = 'nobody';
var group = 'nobody';

tap.test('setup', function(t) {
  t.plan(2);
  exec('id -un', function(err, stdout) {
    t.ifError(err, 'getting current user');
    user = stdout.trim();
  });
  exec('id -gn', function(err, stdout) {
    t.ifError(err, 'getting current group');
    group = stdout.trim();
  });
});

// the rest of these tests use the require()'d version, this is to make sure
// that it remains runnable directly as well
tap.test('version', function(t) {
  var cmd = fmt('%s --version', require.resolve('../bin/sl-executor-install'));
  exec(cmd, function(err, stdout) {
    // stdout = stdout.toString('utf8');
    t.ifError(err, 'should not fail');
    t.match(stdout.trim(), require('../package.json').version,
            'should output version');
    t.end();
  });
});

tap.test('help', function(t) {
  var lines = [];
  install.log = logTo(lines);
  install.error = logTo(lines);
  install(installCmd('--help'), function(err) {
    var output = lines.join('\n');
    t.ifError(err, 'should not fail');
    t.match(output, /Options:/i, 'should list usage');
    t.end();
  });
});

tap.test('bad platform', function(t) {
  var lines = [];
  install.platform = 'not-linux';
  install.ignorePlatform = false;
  install.log = logTo(lines);
  install.error = logTo(lines);
  var cmd = installCmd('--control', 'http://token@host', '--upstart', '10.10');
  install(cmd, function(err) {
    var output = lines.join('\n');
    t.match(err, Error(), 'should fail');
    t.match(output, /Unsupported platform/i, 'should complain about platform');
    t.end();
  });
});

tap.test('extra args', function(t) {
  var lines = [];
  install.log = logTo(lines);
  install.error = logTo(lines);
  install(installCmd('extra-args'), function(err) {
    var output = lines.join('\n');
    t.match(err, Error(), 'should fail');
    t.match(output, /extra arguments/i, 'should complain about usage');
    t.end();
  });
});

tap.test('invalid args', function(t) {
  var lines = [];
  install.log = logTo(lines);
  install.error = logTo(lines);
  install(installCmd('--systemd', '--unknown'), function(err) {
    var output = lines.join('\n');
    t.match(err, Error(), 'should fail');
    t.match(output, /near option/i, 'should complain about usage');
    t.end();
  });
});

tap.test('bad port', function(t) {
  var lines = [];
  install.log = logTo(lines);
  install.error = logTo(lines);
  install(installCmd('--base-port', '0'), function(err) {
    var output = lines.join('\n');
    t.match(err, Error(), 'should fail');
    t.match(output, /Invalid port/i, 'should complain about port');
    t.end();
  });
});

tap.test('bad control URL', function(t) {
  var lines = [];
  install.log = logTo(lines);
  install.error = logTo(lines);
  install(installCmd('--control', 'http://noauth-host/'), function(err) {
    var output = lines.join('\n');
    t.match(err, Error(), 'should fail');
    t.match(output, /Invalid control URL/i, 'should complain about URL');
    t.end();
  });
});

tap.test('bad control URL', function(t) {
  var lines = [];
  install.log = logTo(lines);
  install.error = logTo(lines);
  install(installCmd('--control', 'token@host'), function(err) {
    var output = lines.join('\n');
    t.match(err, Error(), 'should fail');
    t.match(output, /Invalid control URL/i, 'should complain about URL');
    t.end();
  });
});

tap.test('dry-run', function(t) {
  var lines = [];
  install.log = logTo(lines);
  install.error = logTo(lines);
  install.ignorePlatform = true;
  var args = installCmd(
    '--dry-run',
    '--force',
    '--base', __dirname,
    '--base-port', '3000',
    '--control', 'http://token@localhost:8701',
    '--job-file', path.join(__dirname, 'upstart-test.conf')
  );

  install(args, function(err) {
    var output = lines.join('\n');
    t.ifError(err, 'should not fail');
    t.match(output, /dry-run mode/i, 'should notice dry-run mode');
    t.match(output, /strong-executor installed/, 'should claim success');
    t.end();
  });
});

function installCmd() {
  return [
    'execPath', 'installer.js',
    '--user', user,
    '--group', group,
  ].concat([].slice.apply(arguments));
}

function logTo(lineBuffer) {
  return log;

  function log() {
    lineBuffer.push(fmt.apply(null, arguments));
  }
}
