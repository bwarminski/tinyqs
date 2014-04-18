/**
 * Created by bwarminski on 4/6/14.
 */

var net = require('net');
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var MAX_BUFFER_SIZE = (1024*64);

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
    this.buffer = '';
    this.len = 0;
    this.waitingFor = -1;
    this.args = [];
}

// *2\r\n$4\r\nSEND\r\n$<num>\r\n<channel>

Client.prototype.handleData = function(data) {
    var len, newline;
    this.buffer = this.buffer + data;

    while (this.open && this.buffer.length > 0 && !this.callInProgress) {
        var buffer = this.buffer;
        if (this.len == 0) {
            newline = this.buffer.indexOf('\r\n');
            if (newline < 0) {
                if (buffer.length > MAX_BUFFER_SIZE) {
                    this.open = false;
                    this.conn.end('input buffer too big', 'ascii');
                }
                break;
            }

            if (buffer[0] != '*') {
                this.open = false;
                this.conn.end('invalid input prefix', 'ascii');
                break;
            }

            len = parseInt(buffer.slice(1,newline));
            if (_.isNaN(len) || len > 1024*1024) {
                this.open = false;
                this.conn.end('invalid input length', 'ascii');
                break;
            }
            this.len = len;

            buffer = this.buffer = buffer.slice(newline+2);
        }

        while (this.len > 0) {
            if (this.waitingFor < 0) {
                newline = buffer.indexOf('\r\n');
                if (newline < 0) {
                    if (buffer.length > MAX_BUFFER_SIZE) {
                        this.open = false;
                        this.conn.end('input buffer too big', 'ascii');
                    }

                    break;
                }

                if (buffer[0] != '$') {
                    this.open = false;
                    this.conn.end('expected $', 'ascii');
                    break;
                }

                len = parseInt(buffer.slice(1, newline));
                if (_.isNaN(len) || len < 0 || len > 512*1024*1024) {
                    this.open = false;
                    this.conn.end('invalid input length', 'ascii');
                    break;
                }
                this.waitingFor = len;
                buffer = this.buffer = buffer.slice(newline+2);
            }

            if (buffer.length < this.waitingFor+2) {
                break;
            }

            this.args.push(buffer.slice(0, this.waitingFor));
            buffer = this.buffer = buffer.slice(this.waitingFor+2);
            this.waitingFor = -1;
            this.len--;
        }

        if (this.len == 0 && this.args.length > 0) {
            this.callInProgress = true;
            this.processCommand();
        }
    }
};

Client.prototype.processCommand = function() {
    var cmd = this.args[0].toLowerCase();

    var cmdPtr = this.datastore.commands[cmd];
    if (cmdPtr && cmdPtr.arity == this.args.length-1) {
        var args = _.rest(this.args);
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
    this.len = 0;
    this.waitingFor = -1;
    this.args = [];

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
        conn.setEncoding('ascii');
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



