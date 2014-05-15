
/**
 * Module dependencies.
 */

var Pools = require('./modules/pools');
var Datastore = require('./modules/putTakeDatastore');
var tcpServer = require('./modules/tcpServer');
var httpServer = require('./modules/httpServer');

var pools = new Pools({default: {}});
pools.init(function(err) {
    if (!err) {
        var datastore = new Datastore(pools);
        var server = tcpServer.create(datastore).listen(8080, function() {
            console.log('Server started!');
        });

        var restServer = httpServer.create(datastore);

        restServer.listen(8000, function() {
            console.log('REST server started');
        });
        setInterval(function() { datastore.tick(Date.now()) }, 100000);
    }
});