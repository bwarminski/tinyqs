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
        'peek' : {
            artiy: 2,
            fn: this.peek
        },
        'delete' : {
            arity: 2,
            fn : this.delete
        },
        'touch' : {
            arity: 2,
            fn: this.touch
        },
        'put' : {
            arity: 2,
            fn: this.put
        },
        'take' : {
            arity: 2,
            fn: this.take
        },
        'respond' : {
            arity: 3,
            fn: this.respond
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
};

// GET /channel/:channel - next
function pollChannel(channel, timeout, release, cb ) {
    var pool = this.pools.channel(channel);
    pool.acquire(function (err, client) {
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
            client.brpoplpush(channel + ":active", channel + (release ? ":active" : ":reserved"), timeout, function (err, uuid) {
                if (err || uuid === null) {
                    pool.release(client);
                    return cb(err, uuid);
                }

                client.hget(channel + ":data", uuid, function (err, reply) {
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

                client.hget(channel + ":data", uuid, function (err, reply) {
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

Datastore.prototype.touch = function(channel, uuid, cb) {
    var pools = this.pools;
    var pool = pools.channel(channel);
    pool.acquire(function(err, client) {
        if (err) {
            return cb(err);
        }

        // KEYS: channel:reserved channel:pending channel:ttl
        // ARGS: uuid, now
        client.evalsha(pools.getScript('touch'), 4, channel+":reserved", channel+":pending", channel+":ttl", channel+":data", uuid, Date.now(), function(err, reply) {
            pool.release(client);
            cb(err, reply);
        })
    });
};

/* -- Level 2 Commands -- */

Datastore.prototype.put = function(channel, data, cb) {
    // Generate response uuid
    var self = this;
    var pools = this.pools;

    var responseUUID;
    var success = false;

    async.doUntil(function(cb) {
        responseUUID = UUID.v4();
        var pool = pools.channel(responseUUID);
        pool.acquire(function(err, client) {
            if (err) {
                return cb(err);
            }

            client.setnx(responseUUID, '', function(err, res) {
                pool.release(client);
                if (err) {
                    return cb(err);
                }
                success = res != '0';
                cb();
            });
        });
    }, function() {
        return success;
    }, function(err) {
        if (err) {
            return cb(err);
        }

        // Lock response channel
        // send data to request channel with response uuid prepended
        // return response uuid
        self.send(channel, responseUUID+data, function(err) {
            if (err) {
                return cb(err);
            }
            cb(null, {
                uuid: responseUUID
            });
        })
    });
};

Datastore.prototype.take = function(channel, timeout, cb) {
    // Receive on channel
    // On successful return, split off response channel uuid and return request uuid, response uuid and data
    this.receive(channel, timeout, function(err, result) {
        if (err) {
            return cb(err);
        }

        if (!result) {
            cb(null, result);
        } else {
            cb(null, {
                request: result.uuid,
                data: result.data.substr(36)
            });
        }
    })
};

Datastore.prototype.respond = function(channel, requestUUID, data, cb) {
    var self = this;
    // Touch on channel to get response UUID
    this.touch(channel, requestUUID, function(err, res) {
        if (err || !res) {
            return cb(err, res);
        }
        var responseUUID = res.substr(0, 36);
        // send data on responseUuuid
        self.send(responseUUID, data, function(err, result) {
            if (err) {
                return cb(err);
            }

            // delete channelUuid
            self.delete(channel, requestUUID, _.noop);
            cb(null, result);
        })
    });
};

Datastore.prototype.wait = function(uuid, timeout, cb) {
    // Receive on uuid channel
    var pools = this.pools;
    this.peek(uuid, timeout, function(err, response) {
        if (!err && response !== null) {
            // KEYS: channel:reserved channel:pending channel:active responseUUID channel:ttl
            var pool = pools.channel(uuid);
            pool.acquire(function(err, client) {
                if (!err) {
                    client.evalsha(pools.getScript('consume'), 5, uuid+':reserved', uuid+':pending', uuid+':active', uuid, uuid+':ttl', function() {
                        pool.release(client);
                    })
                }
            });
        }

        cb(err, response);

    });
    // Set expires on lock and channel
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