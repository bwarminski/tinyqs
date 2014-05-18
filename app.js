
/**
 * Module dependencies.
 */

var Pools = require('./modules/pools');
var Datastore = require('./modules/putTakeDatastore');
var tcpServer = require('./modules/tcpServer');
var httpServer = require('./modules/httpServer');
var config = require('./config/config');
var _ = require('lodash');

var pools = new Pools(config.pools);
pools.init(function(err) {
    if (!err) {
        var datastore = new Datastore(pools);

        if (config.tcpServer) {
            var server = tcpServer.create(datastore, config.tcpServer.options);
            if (_.isArray(config.tcpServer.listen[0])) {
                _.each(config.tcpServer.listen, function(args, idx) {
                    args = _.clone(args);
                    args.push(function() {
                        console.log('TCP server #' + idx + ' started');
                    });
                    server.listen.apply(server, args);
                });
            } else {
                var args = _.clone(config.tcpServer.listen);
                args.push(function() {
                    console.log('TCP server started');
                });
                server.listen.apply(server, args);
            }
        }

        if (config.httpServer) {
            var restServer = httpServer.create(datastore, config.httpServer.options);
            if (_.isArray(config.httpServer.listen[0])) {
                _.each(config.httpServer.listen, function(args, idx) {
                    args = _.clone(args);
                    args.push(function() {
                        console.log('HTTP server #' + idx + ' started');
                    });
                    restServer.listen.apply(server, args);
                });
            } else {
                var args = _.clone(config.httpServer.listen);
                args.push(function() {
                    console.log('HTTP server started');
                });
                restServer.listen.apply(server, args);
            }
        }

        setInterval(function() { datastore.tick(Date.now()) }, config.datastore.tickInterval || 60000);
    }
});