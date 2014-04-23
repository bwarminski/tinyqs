/**
 * Created by bwarminski on 4/6/14.
 */

var net = require('net');
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var hiredis = require('hiredis');

/*
 var EventEmitter = require('events').EventEmitter;
 util.inherits(Master, EventEmitter);
 */

function Server(tcpServer) {

    this.listen = function() {
        tcpServer.listen.apply(tcpServer, arguments);
    }
}

util.inherits(Server, EventEmitter);

function Client(datastore, conn) {
    this.datastore = datastore;
    this.conn = conn;
    this.open = true;
    this.callInProgress = false;
    this.reader = new hiredis.Reader({return_buffers: true});
    this.args = undefined;
}

// *2\r\n$4\r\nSEND\r\n$<num>\r\n<channel>

Client.prototype.handleData = function(data) {
    this.reader.feed(data);
    if (this.open && !this.callInProgress) {
        try {
            this.args = this.reader.get();
        } catch (e) {
            this.open = false;
            this.conn.end('-'+e, 'ascii');
            return;
        }
    }

    if (this.args !== undefined) {
        if (!_.isArray(this.args)) {
            this.open = false;
            this.conn.end('-MALFORMED COMMAND', 'ascii');
        } else {
            this.callInProgress = true;
            this.processCommand();
        }
    }
};

Client.prototype.processCommand = function() {
    var cmd = this.args[0].toString().toLowerCase();

    var cmdPtr = this.datastore.commands[cmd];
    if (cmdPtr && cmdPtr.arity == this.args.length-1) {
        var args = _.map(_.rest(this.args), function(arg, idx) {
            if (_.contains(cmdPtr.bufferArgs, idx)) {
                return arg;
            } else {
                return arg.toString();
            }
        });
        var self = this;
        args.push(function() {self.respond.apply(self, arguments)});
        cmdPtr.fn.apply(this.datastore, args)
    } else {
        this.respond('unknown command');
    }
};

function writeValue(conn, value) {
    if (_.isArray(value)) {
        conn.write('*'+value.length+'\r\n');
        _.each(value, function(arg) {
            writeValue(conn, arg);
        })
    } else if (Buffer.isBuffer(value)) {
        conn.write('$'+value.length+'\r\n');
        conn.write(value);
        conn.write('\r\n');
    } else if (_.isObject(value)) {
        var pairs = _.pairs(value);
        conn.write('*'+pairs.length*2+'\r\n');
        _.each(pairs, function(pair) {
            writeValue(conn, pair[0]);
            writeValue(conn, pair[1]);
        })
    } else if (_.isNull(value) || _.isUndefined(value) || _.isNaN(value)) {
        conn.write('$-1\r\n');
    } else {
        var str = ''+value;
        conn.write('$'+str.length+'\r\n');
        conn.write(str+'\r\n');
    }
}

Client.prototype.respond = function() {
    this.callInProgress = false;
    this.args = undefined;

    if (arguments[0]) {
        this.conn.write('-'+arguments[0]+'\r\n');
    } else {
        var rest = _.rest(arguments);
        this.conn.write('*'+rest.length+'\r\n');
        _.each(rest, function(arg) {
            writeValue(this.conn, arg);
        }, this);
    }


    this.handleData('');
};

exports.create = function(datastore, options) {
    var defaults = {};
    options = _.extend({}, defaults, options);

    var clients = [];

    var removeClient = function(client) {
        var idx = clients.indexOf(client);
        if (idx >= 0) {
            clients.splice(idx, 1);
        }
    };

    var tcpServer = net.createServer(options, function(conn) {
        var client = new Client(datastore, conn);
        clients.push(client);
        conn.on('error', function() {
            client.open = false;
            removeClient(client);
        });
        conn.on('close', function() {
            client.open = false;
            removeClient(client);
        });

        conn.on('data', function(chunk) {
            client.handleData(chunk);
        });
    });

    var server = new Server(tcpServer);

    tcpServer.on('error', function(e) {
        server.emit('error', e);
    });
    return server;
};



