// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-executor
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Server = require('strong-control-channel/test/mock-server');

module.exports = Central;

// onRequest, requests and notifications
// onListening, called when server is listening, argument is server url
function Central(onRequest, onListening) {
  return new Server('executor-control', onRequest, onListening);
}
