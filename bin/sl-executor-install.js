#!/usr/bin/env node

var Parser = require('posix-getopt').BasicParser;
var fs = require('fs');
var path = require('path');
var slServiceInstall = require('strong-service-install');
var url = require('url');

module.exports = install;
install.log = console.log;
install.error = console.error;
install.platform = process.platform;
install.$0 = process.env.CMD || path.basename(process.argv[1]);
install.execPath = process.execPath;
install.slServiceInstall = slServiceInstall;

if (require.main === module) {
  install(process.argv, function(err) {
    process.exit(err ? 1 : 0);
  });
}

function printHelp($0, prn) {
  var usageFile = require.resolve('../bin/sl-executor-install.txt');
  var USAGE = fs.readFileSync(usageFile, 'utf-8')
                .replace(/%MAIN%/g, $0)
                .trim();
  prn(USAGE);
}

function install(argv, callback) {
  var $0 = install.$0;
  var parser = new Parser([
      ':v(version)',
      'h(help)',
      'b:(base)',
      'C:(control)',
      'u:(user)',
      'g:(group)',
      'P:(base-port)',
      'j:(job-file)',
      'n(dry-run)',
      'f(force)',
      'U:(upstart)',
      's(systemd)',
    ].join(''),
    argv);

  var jobConfig = {
    user: 'strong-executor',
    executorBaseDir: null, // defaults to options.cwd in fillInHome
    executorPort: 3000,
    controlUrl: null,
    dryRun: false,
    jobFile: null, // strong-service-install provides an init-specific default
    force: false,
    upstart: false,
    systemd: false,
    env: {},
    executorEnv: '',
  };

  var errors = 0;
  var option;
  while ((option = parser.getopt()) !== undefined) {
    switch (option.option) {
      case 'v':
        install.log(require('../package.json').version);
        return callback();
      case 'h':
        printHelp($0, install.log);
        return callback();
      case 'b':
        jobConfig.executorBaseDir = option.optarg;
        break;
      case 'C':
        jobConfig.controlUrl = option.optarg.trim();
        break;
      case 'P':
        jobConfig.executorPort = option.optarg | 0; // cast to an integer
        break;
      case 'u':
        jobConfig.user = option.optarg;
        break;
      case 'g':
        jobConfig.group = option.optarg;
        break;
      case 'j':
        jobConfig.jobFile = option.optarg;
        break;
      case 'n':
        jobConfig.dryRun = true;
        break;
      case 'f':
        jobConfig.force = true;
        break;
      case 'U':
        jobConfig.upstart = option.optarg;
        break;
      case 's':
        jobConfig.systemd = true;
        break;
      default:
        install.error('Invalid usage (near option \'%s\').', option.optopt);
        return callback(Error('usage'));
    }
  }

  if (parser.optind() !== argv.length) {
    install.error('Invalid usage (extra arguments).');
    errors += 1;
  }

  if (jobConfig.executorPort < 1) {
    install.error('Invalid port specified.');
    errors += 1;
  }

  if (!url.parse(jobConfig.controlUrl || '').auth) {
    install.error('Invalid control URL "%s".', jobConfig.controlUrl);
    errors += 1;
  }

  if (errors > 0) {
    install.error('Try `%s --help`.', install.$0);
    return callback(Error('usage'));
  }

  jobConfig.name = 'strong-executor';
  jobConfig.description = 'StrongLoop Mesh Executor';

  slServiceInstall.log = install.log;
  slServiceInstall.error = install.error;
  slServiceInstall.$0 = install.$0;
  slServiceInstall.platform = install.platform;
  slServiceInstall.ignorePlatform = install.ignorePlatform;

  if (jobConfig.executorBaseDir) {
    jobConfig.executorBaseDir = path.resolve(jobConfig.executorBaseDir);
    jobConfig.dirs = [jobConfig.executorBaseDir];
  }

  jobConfig.command = [
    install.execPath,
    require.resolve('./sl-executor'),
    '--control', jobConfig.controlUrl,
    '--base-port', jobConfig.executorPort,
    // relative to CWD, which defaults to $HOME of user that executor runs as
    '--base', jobConfig.executorBaseDir || '.',
  ];

  return install.slServiceInstall(jobConfig, report);

  function report(err) {
    if (err) {
      install.error('Error installing service \'%s\':',
                    jobConfig.name, err.message);
    }
    return callback(err);
  }
}
