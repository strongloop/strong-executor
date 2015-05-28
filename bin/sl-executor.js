#!/usr/bin/env node
'use strict';

// Exit on loss of parent process, if it had established an ipc control channel.
// We do this ASAP because we don't want child processes to leak, outliving
// their parent. If the parent has not established an 'ipc' channel to us, this
// will be a no-op, the disconnect event will never occur.
process.on('disconnect', function() {
  process.exit(2);
});

var Parser = require('posix-getopt').BasicParser;
var defaults = require('strong-url-defaults');
var mkdirp = require('mkdirp').sync;
var path = require('path');
var fs = require('fs');

var Executor = require('../');

function printHelp($0, prn) {
  var USAGE = fs.readFileSync(require.resolve('./sl-executor.txt'), 'utf-8')
    .replace(/%MAIN%/g, $0)
    .trim();

  prn(USAGE);
}

var $0 = process.env.CMD ? process.env.CMD : path.basename(process.argv[1]);
var parser = new Parser([
  ':v(version)',
  'h(help)',
  'b:(base)',
  'd:(driver)',
  'C:(control)',
].join(''), process.argv);

var base = '.strong-executor';
var control = 'http:';
var driver = 'direct';

var option;
while ((option = parser.getopt()) !== undefined) {
  switch (option.option) {
    case 'v':
      console.log(require('../package.json').version);
      process.exit(0);
      break;
    case 'h':
      printHelp($0, console.log);
      process.exit(0);
      break;
    case 'b':
      base = option.optarg;
      break;
    case 'd':
      driver = option.optarg;
      break;
    case 'C':
      control = option.optarg;
      break;
    default:
      console.error('Invalid usage (near option \'%s\'), try `%s --help`.',
                    option.optopt, $0);
      process.exit(1);
      break;
  }
}

base = path.resolve(base);

if (parser.optind() !== process.argv.length) {
  console.error('Invalid usage (extra arguments), try `%s --help`.', $0);
  process.exit(1);
}

// Run from base directory, so files and paths are created in it.
mkdirp(base);
process.chdir(base);

control = defaults(control, {
  host: '127.0.0.1',
  port: 8701,
});


var exec = new Executor({
  cmdName: $0,
  control: control,
  driver: driver,
});

exec.start();
