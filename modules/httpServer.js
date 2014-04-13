/**
 * Created by bwarminski on 4/13/14.
 */

var restify = require('restify');
var url = require('url');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var util = require('util');

function Server(httpServer) {
    this.listen = function() {
        httpServer.listen.apply(httpServer, arguments);
    }
}

util.inherits(Server, EventEmitter);

exports.create = function(datastore, options) {
    var defaults = {};
    options = _.extend({}, defaults, options);

    var httpServer = restify.createServer(options);

    httpServer.post('/channel/:channel', function(req, res, next) {
        req.setEncoding('ascii');

        var data = '';
        req.on('data', function(chunk) {
            data = data + chunk;
        });
        req.on('end', function() {
            datastore.send(req.params.channel, data, function(err, uuid) {
                if (err) {
                    res.send(500, err);
                } else {
                    res.send({uuid: uuid});
                }
                next();
            })
        })
    });

    httpServer.get('/channel/:channel', function(req, res, next) {
        req.setEncoding('ascii');

        var params = url.parse(req.url, true);
        var timeout = params.query.timeout || 0;
        datastore.receive(req.params.channel, timeout, function(err, result) {
            if (err) {
                res.send(500, err);
            } else if (result == null) {
                res.send(404, 'Timed out waiting for message');
            } else {
                res.send(result);
            }
            next();
        });
    });

    httpServer.del('/channel/:channel/:uuid', function(req, res, next) {
        req.setEncoding('ascii');

        datastore.delete(req.params.channel, req.params.uuid, function(err, result) {
            if (err) {
                res.send(500, err);
            } else if (result == "0") {
                res.send(404, 'UUID not found in channel');
            } else {
                res.send(200, 'Success');
            }
            next();
        })
    });

    var server = new Server(httpServer);

    httpServer.on('error', function(e) {
        server.emit('error', e);
    });

    return server;
}