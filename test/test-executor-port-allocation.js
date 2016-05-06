// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-executor
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var Container = require('../lib/container');
var Executor = require('../lib/executor');
var tap = require('tap');

tap.test('executor', function(t) {
  var e = new Executor({
    basePort: 4000,
    control: 'http://token@host:66',
  });

  t.test('port allocation', function(t) {
    function set(id, port) {
      e._containers[id] = new Container({
        env: {
          PORT: String(port),
        },
        control: 'http://hi@',
        deploymentId: 'X',
        id: id,
        options: {},
        token: 'T',
      });
    }

    t.equal(e._unusedPort(), 4001, 'first');
    set('a', 4001);
    set('b', 4002);
    set('d', 4004);
    t.equal(e._unusedPort(), 4003, 'third');
    set('c', 4003);
    t.equal(e._unusedPort(), 4005, 'fifth');
    delete e._containers.b;
    t.equal(e._unusedPort(), 4002, 'second');
    t.end();
  });

  t.end();
});
