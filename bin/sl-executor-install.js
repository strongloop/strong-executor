#!/usr/bin/env node

var Parser = require('posix-getopt').BasicParser;
var fs = require('fs');
var path = require('path');
var slServiceInstall = require('strong-service-install');
var url = require('url');
var Client = require('strong-mesh-models').Client;

module.exports = install;
install.log = console.log;
install.error = console.error;
install.platform = process.platform;
install.$0 = process.env.CMD || path.basename(process.argv[1]);
install.execPath = process.execPath;
install.slServiceInstall = slServiceInstall;
install.Client = null;

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
      'A:(svc-addr)',
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
    svcAddr: null,
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
      case 'A':
        jobConfig.svcAddr = option.optarg;
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

  var auth = url.parse(jobConfig.controlUrl || '').auth;
  if (!auth) {
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

  // Skip creation of new executor if a token was provided
  if (auth.indexOf(':') === -1) {
    install.log('Installing with existing token: %s', auth);
    return installWithToken(auth);
  }

  // Register executor and use token in final control URL
  var _Client = install.Client || Client;
  var client = new _Client(jobConfig.controlUrl);
  client.checkRemoteApiSemver(function(err) {
    if (err) return report(err);
    client.executorCreate('executor', function(err, result) {
      if (err) {
        if (err.syscall) {
          // Provide a more user friendly error for network connection issues
          install.error('Invalid control URL "%s".', jobConfig.controlUrl);
          install.error('Try `%s --help`.', install.$0);
          return callback(Error('usage'));
        }
        return report(err);
      }
      install.log('Registered Executor id: %s token: %s',
        result.id, result.token);
      installWithToken(result.token);
    });
  });

  function installWithToken(token) {
    var controlUrl = url.parse(jobConfig.controlUrl);
    controlUrl.auth = token;
    jobConfig.controlUrl = url.format(controlUrl);

    jobConfig.command = [
      install.execPath,
      require.resolve('./sl-executor'),
      '--control', jobConfig.controlUrl,
      '--base-port', jobConfig.executorPort,
      // relative to CWD, which defaults to $HOME of user that
      // executor runs as
      '--base', jobConfig.executorBaseDir || '.',
    ];

    if (jobConfig.svcAddr)
      jobConfig.command.push('--svc-addr', jobConfig.svcAddr);

    return install.slServiceInstall(jobConfig, report);
  }

  function report(err) {
    if (err) {
      install.error('Error installing service \'%s\':',
                    jobConfig.name, err.message);
    }
    return callback(err);
  }
}
