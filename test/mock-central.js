'use strict';

var WebsocketRouter = require('strong-control-channel/ws-router');
var assert = require('assert');
var debug = require('../lib/debug')('test:central');
var express = require('express');
var expressWs = require('express-ws');
var extend = require('util')._extend;
var http = require('http');
var url = require('url');


module.exports = Central;

// onRequest, requests and notifications
// onListening, called when server is listening, argument is server url
function Central(onRequest, onListening) {
  var self = this;

  self.app = express();
  self.server = http.createServer(self.app).listen(0);

  expressWs(self.app, self.server);

  self.router = new WebsocketRouter(self.app, 'executor-control');
  self.channel = self.router.createChannel(_onRequest);

  self.server.on('listening', function() {
    var uri = this.uri = url.format({
      protocol: 'http',
      auth: self.channel.getToken(),
      hostname: '127.0.0.1',
      port: this.address().port,
    });
    debug('listening on %s', uri, self.channel.getToken());
    assert(url.parse(uri).auth);
    onListening(uri);
  });

  function _onRequest(req, callback) {
    debug('onRequest: %j', req);
    onRequest(req, callback);
  }

  function _onNotification(req) {
    debug('onNotification: %j', req);
    onRequest(req, function() {});
  }
}

Central.prototype.stop = function(callback) {
  this.server.close(callback);
};

Central.prototype.request = function(req, callback) {
  debug('request: %j', req);
  this.channel.request(req, function(rsp) {
    debug('response: %j', rsp);
    callback(rsp);
  });
};