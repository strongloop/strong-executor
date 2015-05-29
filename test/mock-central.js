'use strict';

var Server = require('strong-control-channel/test/mock-server');

module.exports = Central;

// onRequest, requests and notifications
// onListening, called when server is listening, argument is server url
function Central(onRequest, onListening) {
  return new Server('executor-control', onRequest, onListening);
}
