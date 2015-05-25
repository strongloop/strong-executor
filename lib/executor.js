'use strict';

var debug = require('./debug')('executor');
var util = require('util');

module.exports = Executor;

function Executor(options) {
  this._options = util._extend({}, options);
  this.console = this._options.console || console;
}

Executor.prototype.start = function() {
  debug('start');
};
