'use strict';

var _debug = require('debug');

module.exports = debug;

function debug() {
  var components = ['strong-executor'];
  components.push.apply(components, arguments);
  return _debug(components.join(':'));
}
