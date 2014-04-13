/**
 * Created by bwarminski on 4/5/14.
 */

var async = require('async');
var UUID = require('node-uuid');
var _ = require('lodash');

function Datastore(pools) {
    this.pools = pools;
    this.commands = {
        'send' : {
            arity: 2,
            fn: this.send
        },
        'receive' : {
            arity: 2,
            fn: this.receive
        },
        'delete' : {
            arity: 2,
            fn : this.delete
        }
    }
}

// *2\r\n$4\r\nSEND\r\n$<num>\r\n<channel>
// POST /channel/:channel
Datastore.prototype.send = function(channel, message, cb) {
    var pools = this.pools;
    var pool = this.pools.channel(channel);
    pool.acquire(function(err, client) {
        if (err) {
            return cb(err);
        }

        var uuid;
        var success = false;

        async.doUntil(function(cb) {
            // KEYS: channel:active, channel:data
            // ARGS: uuid data
            uuid = UUID.v4();
            client.evalsha(pools.getScript('send'), 2, channel+":active", channel+":data", uuid, message, function(err, reply) {
                if (err) {
                    cb(err);
                }

                if (reply != 0) {
                    success=true;
                }
                cb();
            });
        }, function() {
            return success;
        }, function(err) {
            pool.release(client);
            cb(err, uuid);
        })
    });
}

// GET /channel/:channel - next
Datastore.prototype.receive = function(channel, timeout, cb) {
    var pool = this.pools.channel(channel);
    pool.acquire(function(err, client) {
        if (err) {
            return cb(err);
        }

        if (_.isFunction(timeout)) {
            cb = timeout;
            timeout = -1;
        }

        timeout = parseInt(timeout);
        if (!_.isNumber(timeout) || _.isNaN(timeout)) {
            timeout = -1;
        }

        if (timeout >= 0) {
            client.brpoplpush(channel+":active", channel+":reserved", timeout, function(err, uuid) {
                if (err || uuid === null) {
                    pool.release(client);
                    return cb(err, uuid);
                }

                client.hget(channel+":data", uuid, function(err, reply) {
                    pool.release(client);
                    cb(err, {uuid: uuid, data: reply});
                });
            });
        } else {
            client.rpoplpush(channel+":active", channel+":reserved", function(err, uuid) {
                if (err || uuid === null) {
                    pool.release(client);
                    return cb(err, uuid);
                }

                client.hget(channel+":data", uuid, function(err, reply) {
                    pool.release(client);
                    cb(err, {uuid: uuid, data: reply});
                });
            });
        }

    });
};

// DELETE /channel/:channel/:uuid
Datastore.prototype.delete = function(channel, uuid, cb) {
    var pools = this.pools;
    var pool = this.pools.channel(channel);
    pool.acquire(function(err, client) {
        if (err) {
            return cb(err);
        }

        // KEYS: channel:reserved, channel:active, channel:pending, channel:data
        // ARGS: uuid
        client.evalsha(pools.getScript('delete'), 4, channel+":reserved", channel+":active", channel+":pending", channel+":data", uuid, function(err, reply) {
            pool.release(client);
            cb(err, reply);
        })
    });
};

Datastore.prototype.tick = function() {
    var channels = this.pools.channels;
    var pools = this.pools;
    // KEYS: channel:reserved channel:pending channel:active channel:ttl
    // ARGS: now
    var now = Date.now();

    async.each(channels, function(channel, cb) {
        var pool = pools.channel(channel);
        pool.acquire(function(err, client) {
            if (err) {
                return cb(err);
            }

            client.evalsha(pools.getScript('tick'), 4, channel+":reserved", channel+":pending", channel+":active", channel+":ttl", now, function(err) {
                pool.release(client);
                cb(err);
            });

        })
    }, function() {});
};


module.exports = Datastore;