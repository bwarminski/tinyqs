/**
 * Created by bwarminski on 4/6/14.
 */

var redisPool = require('sol-redis-pool');
var _ = require('lodash');
var async = require('async');
var scripts = require('../scripts');

function Pools(poolMap, mapFn) {
    this.channels = [];
    if (!poolMap['default']) {
        throw "No default pool config defined"
    }
    var pools = this.pools = {};
    _.each(poolMap, function(config, key) {
        pools[key] = new redisPool(config);
    });
    this.mapFn = mapFn || function() {return 'default'};
    this.scripts = {};
}

Pools.prototype.init = function(cb) {
    var scriptSHAs = this.scripts;
    cb = cb || _.noop;

    async.each(_.values(this.pools), function(pool, cb) {
        pool.acquire(function(err, client) {
            if (err) {
                return cb(err);
            }
            async.eachSeries(_.pairs(scripts.minified), function(pair, cb) {
                client.script('load', pair[1], function(err, reply) {
                    if (err) {
                        return cb(err);
                    }
                    scriptSHAs[pair[0]] = reply;
                    cb();
                });
            }, function(err) {
                pool.release(client);
                cb(err);
            })
        })
    }, function(err) {
        cb(err);
    });
};

Pools.prototype.channel = function(channel) {
    if (this.channels.indexOf(channel) < 0) {
        this.channels.push(channel);
    }

    var key = this.mapFn(channel) || 'default';
    return this.pools[key];
};

Pools.prototype.getScript = function(script) {
    return this.scripts[script];
};

module.exports = Pools;