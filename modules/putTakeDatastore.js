/**
 * Created by bwarminski on 5/4/14.
 */

var async = require('async');
var _ = require('lodash');
var Datastore = require('./sendReceiveDatastore');
var util = require('util');

function PutTakeDatastore(pools, options) {
    PutTakeDatastore.super_.call(this, pools, options);
}

util.inherits(PutTakeDatastore, Datastore);

/* -- Level 2 Commands -- */

PutTakeDatastore.prototype.put = function(channel, data, cb) {
    // Generate response uuid
    var self = this;
    var pools = this.pools;

    var responseUUID;
    var success = false;

    async.doUntil(function(cb) {
        responseUUID = self.uuid.v4();
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
        var buff = Buffer.concat([self.uuid.parse(responseUUID, new Buffer(16)), data], data.length + 16);
        self.send(channel, buff, function(err) {
            if (err) {
                return cb(err);
            }
            cb(null, {
                uuid: responseUUID
            });
        })
    });
};

PutTakeDatastore.prototype.take = function(channel, timeout, cb) {
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
                data: result.data.slice(16)
            });
        }
    })
};

PutTakeDatastore.prototype.respond = function(channel, requestUUID, data, cb) {
    var self = this;
    // Touch on channel to get response UUID
    this.touch(channel, requestUUID, Date.now(), function(err, res) {
        if (err || !res) {
            return cb(err, res);
        }
        var responseUUID = self.uuid.unparse(res.slice(0, 16));
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

PutTakeDatastore.prototype.wait = function(uuid, timeout, cb) {
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

module.exports = PutTakeDatastore;