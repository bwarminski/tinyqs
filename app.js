
/**
 * Module dependencies.
 */

var Pools = require('./modules/pools');
var Datastore = require('./modules/putTakeDatastore');
var tcpServer = require('./modules/tcpServer');
var httpServer = require('./modules/httpServer');
var config = require('./config/config');
var _ = require('lodash');
var yargs = require('yargs');
var URL = require('url');

var argv = yargs.argv;

var poolConfig = _.cloneDeep(config.pools);
if (argv.pools) {
    _.extend(poolConfig, arg.pools);
}

var pools = new Pools(config.pools);
pools.init(function(err) {
    if (!err) {
        var datastore = new Datastore(pools);

        if (config.tcpServer || argv.tcpServer) {
            var tcpConfig = _.cloneDeep(config.tcpServer);
            tcpConfig = _.extend(tcpConfig || {}, argv.tcpServer);
            var server = tcpServer.create(datastore, tcpConfig.options);

            var setupTcp = function (url) {
                var address = URL.parse(url);
                var args = [];
                if (address.protocol == 'tcp:') {
                    args.push(address.port);
                    if (address.hostname && address.hostname != '0.0.0.0') {
                        args.push(address.hostname);
                    }
                } else if (protocol == 'file:') {
                    args.push(address.pathname);
                } else {
                    throw "Unknown listen option " + url;
                }
                args.push(function () {
                    console.log('TCP server ' + url + ' started');
                });
                server.listen.apply(server, args);
            };

            if (_.isArray(tcpConfig.listen)) {
                _.each(tcpConfig.listen, setupTcp);
            } else {
                setupTcp(tcpConfig.listen);
            }
        }

        if (config.httpServer || argv.httpServer) {
            var httpConfig = _.cloneDeep(config.httpServer);
            httpConfig = _.extend(httpConfig || {}, argv.httpServer);
            var restServer = httpServer.create(datastore, httpConfig.options);

            var setupHttp = function (url) {
                var address = URL.parse(url);
                var args = [];
                if (address.protocol == 'http:') {
                    args.push(address.port);
                    if (address.hostname && address.hostname != '0.0.0.0') {
                        args.push(address.hostname);
                    }
                } else if (protocol == 'file:') {
                    args.push(address.pathname);
                } else {
                    throw "Unknown listen option " + url;
                }
                args.push(function () {
                    console.log('HTTP server ' + url + ' started');
                });
                restServer.listen.apply(restServer, args);
            };

            if (_.isArray(httpConfig.listen)) {
                _.each(httpConfig.listen, setupHttp);
            } else {
                setupHttp(httpConfig.listen);
            }
        }

        var tickInterval = argv.datastore && argv.datastore.tickInterval ? argv.datastore.tickInterval : config.datastore.tickInterval || 60000;
        setInterval(function() { datastore.tick(Date.now()) }, tickInterval);
    }
});