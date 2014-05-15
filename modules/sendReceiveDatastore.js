/**
 * Created by bwarminski on 4/5/14.
 */

var async = require('async');
var _ = require('lodash');

function Datastore(pools, options) {
    this.pools = pools;
    if (options && options.uuid) {
        this.uuid = options.uuid;
    } else {
        this.uuid = require('node-uuid');
    }

    this.commands = {
        'send' : {
            arity: 2,
            fn: this.send,
            bufferArgs: [1]
        },
        'receive' : {
            arity: 2,
            fn: this.receive
        },
        'peek' : {
            arity: 2,
            fn: this.peek
        },
        'delete' : {
            arity: 2,
            fn : this.delete
        },
        'touch' : {
            arity: 3,
            fn: this.touch
        },
        'put' : {
            arity: 2,
            fn: this.put,
            bufferArgs: [1]
        },
        'take' : {
            arity: 2,
            fn: this.take
        },
        'respond' : {
            arity: 3,
            fn: this.respond,
            bufferArgs: [2]
        },
        'wait' : {
            arity: 2,
            fn: this.wait
        }
    }
}

/* -- Level 1 Commands -- */

// *2\r\n$4\r\nSEND\r\n$<num>\r\n<channel>
// POST /channel/:channel
Datastore.prototype.send = function(channel, message, cb) {
    if (!_.isFunction(cb)) {
        throw "Expected callback function"
    }
    if (!channel || !message || !_.isFunction(cb)) {
        return cb(new Error("invalid arguments"));
    }
    var pools = this.pools;
    var pool = this.pools.channel(channel);
    var self = this;
    pool.acquire(function(err, client) {
        if (err) {
            return cb(err);
        }

        var uuid;
        var success = false;

        async.doUntil(function(cb) {
            // KEYS: channel:active, channel:data
            // ARGS: uuid data
            uuid = self.uuid.v4();
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
};

// GET /channel/:channel - next
function pollChannel(channel, timeout, release, cb ) {
    if (!_.isFunction(cb)) {
        throw "Expected callback"
    }
    if (!channel || !_.isFinite(timeout)) {
        return cb(new Error("invalid arguments"));
    }
    var pool = this.pools.channel(channel);
    pool.acquire(function (err, client) {
        if (err) {
            return cb(err);
        }

        timeout = parseInt(timeout);
        if (!_.isNumber(timeout) || _.isNaN(timeout)) {
            timeout = -1;
        }

        if (timeout >= 0) {
            client.brpoplpush(channel + ":active", channel + (release ? ":active" : ":reserved"), timeout, function (err, uuid) {
                if (err || uuid === null) {
                    pool.release(client);
                    return cb(err, uuid);
                }

                client.hget(channel + ":data", new Buffer(uuid, 'ascii'), function (err, reply) {
                    pool.release(client);
                    cb(err, {uuid: uuid, data: reply});
                });
            });
        } else {
            client.rpoplpush(channel + ":active", channel + (release ? ":active" : ":reserved"), function (err, uuid) {
                if (err || uuid === null) {
                    pool.release(client);
                    return cb(err, uuid);
                }

                client.hget(channel + ":data", new Buffer(uuid, 'ascii'), function (err, reply) {
                    pool.release(client);
                    cb(err, {uuid: uuid, data: reply});
                });
            });
        }

    });
}
Datastore.prototype.receive = function(channel, timeout, cb) {
    pollChannel.call(this, channel, timeout, false, cb);
};

Datastore.prototype.peek = function(channel, timeout, cb) {
    pollChannel.call(this, channel, timeout, true, cb);
};

// DELETE /channel/:channel/:uuid
Datastore.prototype.delete = function(channel, uuid, cb) {
    if (!_.isFunction(cb)) {
        throw "Expected callback"
    }
    if (!channel || !uuid) {
        return cb(new Error("invalid arguments"));
    }
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

Datastore.prototype.touch = function(channel, uuid, timestamp, cb) {
    if (!_.isFunction(cb)) {
        throw "Expected callback"
    }
    if (!channel || !uuid || !_.isFinite(timestamp)) {
        return cb(new Error("invalid arguments"));
    }
    var pools = this.pools;
    var pool = pools.channel(channel);
    pool.acquire(function(err, client) {
        if (err) {
            return cb(err);
        }

        // KEYS: channel:reserved channel:pending channel:ttl
        // ARGS: uuid, now
        client.evalsha(pools.getScript('touch'), 4, channel+":reserved", channel+":pending", channel+":ttl", channel+":data", new Buffer(uuid), timestamp, function(err, reply) {
            pool.release(client);
            cb(err, reply);
        })
    });
};



Datastore.prototype.ttl = function(channel, ttl, cb) {
    var pool = this.pools.channel(channel);
    pool.acquire(function(err, client) {
        if (err) {
            cb(err);
        }

        client.set(channel+":ttl", ttl, function(err) {
            pool.release(client);
            cb(err);
        })
    })
};

Datastore.prototype.tick = function(now, cb) {
    var channels = this.pools.channels;
    var pools = this.pools;
    // KEYS: channel:reserved channel:pending channel:active channel:ttl
    // ARGS: now

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
    }, cb);
};


module.exports = Datastore;