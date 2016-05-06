// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-executor
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _debug = require('debug');

module.exports = debug;

function debug() {
  var components = ['strong-executor'];
  components.push.apply(components, arguments);
  return _debug(components.join(':'));
}
