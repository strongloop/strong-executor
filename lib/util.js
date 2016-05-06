// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-executor
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

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
