'use strict';

var assert = require('assert');
var util = require('util');

exports.mandatory = function mandatory(value) {
  assert(value);
  return value;
};

// Extend base without modifying it.
exports.extend = function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
};
