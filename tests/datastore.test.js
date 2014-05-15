/**
 * Created by bwarminski on 4/23/14.
 */

var chai = require("chai");
var sinonChai = require("sinon-chai");
chai.use(sinonChai);

var expect = chai.expect;
var Pools = require('../modules/pools');
var Datastore = require('../modules/putTakeDatastore');
var UUID = require('node-uuid');
var async = require('async');

var pools = new Pools({default: {unix_socket: '/tmp/redis_test.sock'}});

var redis = require("redis"),
    client = redis.createClient('/tmp/redis_test.sock', undefined, {detect_buffers: true});

var lastUUID;

var mockUUID = {
    v4: function() {
        lastUUID = UUID.v4();
        return lastUUID;
    },
    unparse: function() {
        return UUID.unparse.apply(UUID, arguments);
    },
    parse: function() {
        return UUID.parse.apply(UUID, arguments);
    }
};

describe('datastore', function() {
    var datastore;

    before(function(done) {
        pools.init(function(err) {
            if (err) {
                done(err);
            } else {
                datastore = new Datastore(pools, {uuid: mockUUID});
                done();
            }
        })

    });

    before(function(done) {
        client.flushdb(function(err) {
            done(err);
        });
    });

    describe('send', function() {
        var reply;
        before(function(done) {
            datastore.send('testChannel', new Buffer('€100', 'utf8'), function(err, res) {
                reply = res;
                done(err);
            });
        });
        it('generates a uuid', function() {
            expect(reply).to.equal(lastUUID);
        });
        it('places uuid at the end of the active queue', function(done) {
            client.lindex('testChannel:active', '-1', function(err, response) {
                expect(response).to.equal(lastUUID);
                done(err);
            })
        });
        it('stores the data properly', function(done) {
            client.hget(new Buffer('testChannel:data'), lastUUID, function(err, data) {
                if (err) {
                    done(err);
                } else {
                    expect(data.toString('utf8')).equal('€100');
                    done();
                }
            });
        });

        after(function(done) {
            client.flushdb(function(err) {
                done(err);
            });
        });
    });

    describe('invalid send arguments', function() {
        it('null channel is an error', function(done) {
            datastore.send(null, new Buffer(0), function(err, res) {
                expect(err).to.be.ok;
                expect(res).to.not.be.ok;
                done();
            })
        });
        it('null buffer is an error', function(done) {
            datastore.send('test', null, function(err, res) {
                expect(err).to.be.ok;
                expect(res).to.not.be.ok;
                done();
            })
        });
        it('null callback is an error', function() {
            expect(function() {
                datastore.send('test', new Buffer(0), null);
            }).to.throw();
        });
        after(function(done) {
            client.flushdb(function(err) {
                done(err);
            });
        });
    });

    describe('receive', function() {
        var reply;

        before(function(done) {
            datastore.send('testChannel', new Buffer('€100', 'utf8'), function(err, res) {
                if (err) {
                    done(err);
                } else {
                    datastore.receive('testChannel', -1, function(err, res) {
                        reply = res;
                        done(err);
                    })
                }
            });
        });

        it('returns the correct uuid', function() {
            expect(reply.uuid).to.equal(lastUUID);
        });

        it('returns the correct data', function() {
            expect(reply.data.toString('utf8')).to.equal('€100');
        });

        it('removes the data from the active queue', function(done) {
            client.llen('testChannel:active', function(err, len) {
                if (err) {
                    done(err);
                } else {
                    expect(len).to.equal(0);
                    done();
                }
            })
        });

        it('puts the uuid at the end of the pending queue', function(done) {
            client.lindex('testChannel:reserved', '-1', function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.equal(lastUUID);
                    done();
                }
            })
        });

        after(function(done) {
            client.flushdb(function(err) {
                done(err);
            });
        });
    });

    describe('invalid receive arguments', function() {
        it('null channel is an error', function(done) {
            datastore.receive(null, -1, function(err) {
                expect(err).to.be.ok;
                done();
            });
        });
        it('Invalid number is an error', function(done) {
            datastore.receive('testChannel', NaN, function(err) {
                expect(err).to.be.ok;
                done();
            })
        });
        it('Missing callback is an error', function() {
            expect(function() {
                datastore.receive('testChannel', -1);
            }).to.throw();
        })
    });

    describe('peek', function() {
        var reply;

        before(function(done) {
            datastore.send('testChannel', new Buffer('€100', 'utf8'), function(err, res) {
                if (err) {
                    done(err);
                } else {
                    datastore.peek('testChannel', -1, function(err, res) {
                        reply = res;
                        done(err);
                    })
                }
            });
        });

        it('returns the correct uuid', function() {
            expect(reply.uuid).to.equal(lastUUID);
        });

        it('returns the correct data', function() {
            expect(reply.data.toString('utf8')).to.equal('€100');
        });

        it('leaves the data in the active queue', function(done) {
            client.lindex('testChannel:active', '-1', function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.equal(lastUUID);
                    done();
                }
            })
        });
        after(function(done) {
            client.flushdb(function(err) {
                done(err);
            });
        });
    });

    describe('invalid peek arguments', function() {
        it('null channel is an error', function(done) {
            datastore.peek(null, -1, function(err) {
                expect(err).to.be.ok;
                done();
            });
        });
        it('Invalid number is an error', function(done) {
            datastore.peek('testChannel', NaN, function(err) {
                expect(err).to.be.ok;
                done();
            })
        });
        it('Missing callback is an error', function() {
            expect(function() {
                datastore.peek('testChannel', -1);
            }).to.throw();
        })
    });

    describe('empty channel', function() {
        it('receive times out', function(done) {
            datastore.receive('testChannel', 1, function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.be.null;
                    done();
                }
            })
        });
        it('peek times out', function(done) {
            datastore.peek('testChannel', 1, function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.be.null;
                    done();
                }
            })
        });
        it('receive blocks until a message arrives', function(done) {
            datastore.receive('testChannel', 0, function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.not.be.null;
                    done();
                }
            });
            datastore.send('testChannel', new Buffer('€100', 'utf8'), function(err, res) {
                if (err) {
                    done(err);
                }
            });

            after(function(done) {
                client.flushdb(function(err) {
                    done(err);
                });
            });
        });

        it('peek blocks until a message arrives', function(done) {
            datastore.peek('testChannel', 0, function(err, res) {
                if (err) {
                    done(err);
                } else {
                    expect(res).to.not.be.null;
                    done();
                }
            });
            datastore.send('testChannel', new Buffer('€100', 'utf8'), function(err, res) {
                if (err) {
                    done(err);
                }
            });

            after(function(done) {
                client.flushdb(function(err) {
                    done(err);
                });
            });
        });

        it('touch on a non-existent message returns nil', function(done) {
            datastore.touch('testChannel', 'nonexistentuuid', Date.now(), function(err, response) {
                expect(err).to.not.be.ok;
                expect(response).to.not.be.ok;
                done();
            })
        })
    });

    describe('tick', function() {
        beforeEach(function(done) {
            async.series([
                function(cb) {
                    datastore.send('testChannelTick', new Buffer('€100', 'utf8'), function(err) {
                        cb(err);
                    });
                },
                function(cb) {
                    datastore.receive('testChannelTick', -1, function(err) {
                        cb(err);
                    })
                }
            ], function(err) {
                done(err);
            })

        });

        afterEach(function(done) {
            client.flushdb(function(err) {
                done(err);
            });
        });

        it('moves reserved to pending', function(done) {
            async.series([
                function(cb) {
                    datastore.ttl('testChannelTick', 100, cb);
                },
                function(cb) {
                    datastore.tick(100, cb);
                },
                function(cb) {
                    client.zscore('testChannelTick:pending', lastUUID, function(err, score) {
                        cb(err, score);
                    })
                }
            ], function(err, arr) {
                if (err) {
                    done(err);
                } else {
                    expect(arr[2]).to.equal('200');
                    done();
                }
            })
        });
        it('moves expired pending to active', function(done) {
            async.series([
                function(cb) {
                    datastore.ttl('testChannelTick', 100, cb);
                },
                function(cb) {
                    datastore.tick(100, cb);
                },
                function(cb) {
                    datastore.tick(201, cb);
                },
                function(cb) {
                    client.lindex('testChannelTick:active', '-1', function(err, uuid) {
                        cb(err, uuid);
                    })
                }
            ], function(err, arr) {
                if (err) {
                    done(err);
                } else {
                    expect(arr[3]).to.equal(lastUUID);
                    done();
                }
            });
        });
    });

    describe('reserved messages', function() {
        var responseUuid;
        beforeEach(function(done) {
            async.series([
                function(cb) {
                    datastore.send('testChannelTouch', new Buffer('€100', 'utf8'), function(err) {
                        cb(err);
                    });
                },
                function(cb) {
                    datastore.receive('testChannelTouch', -1, function(err, response) {
                        if (err || !response) {
                            cb(err || "Null reponse");
                        } else {
                            cb(err, response.uuid);
                        }
                    })
                }
            ], function(err, arr) {
                if (!err) {
                    responseUuid = arr[1];
                }
                done(err);
            })

        });

        afterEach(function(done) {
            client.flushdb(function() {
                done();
            })
        });

        describe('touch', function() {
            it('updates the TTL on a pre-tick reserved message', function(done) {
                datastore.touch('testChannelTouch', responseUuid, 200, function(err) {
                    if (err) {
                        return done(err);
                    } else {
                        client.zscore('testChannelTouch:pending', responseUuid, function(err, score) {
                            expect(parseInt(score)).to.eql(1200);
                            done(err);
                        })
                    }
                })
            });

            it('updates the TTL on a post-tick reserved message', function(done) {
                datastore.tick(100, function(err) {
                    if (err) {
                        return done(err);
                    }

                    datastore.touch('testChannelTouch', responseUuid, 200, function(err) {
                        if (err) {
                            return done(err);
                        } else {
                            client.zscore('testChannelTouch:pending', responseUuid, function(err, score) {
                                expect(parseInt(score)).to.eql(1200);
                                done(err);
                            })
                        }
                    })
                })
            });

            it('null channel is an error', function(done) {
                datastore.touch(null, responseUuid, 200, function(err) {
                    expect(err).to.be.ok;
                    done();
                })
            });

            it('null uuid is an error', function(done) {
                datastore.touch('testChannelTouch', null, 200, function(err) {
                    expect(err).to.be.ok;
                    done();
                })
            });

            it('null timestamp is an error', function(done) {
                datastore.touch('testChannelTouch', responseUuid, null, function(err) {
                    expect(err).to.be.ok;
                    done();
                })
            })
        });
        describe('delete', function() {
            it('removes uuid and data on a pre-tick reserved message', function(done) {
                datastore.delete('testChannelTouch', responseUuid, function(err) {
                    if (err) {
                        return done(err);
                    } else {
                        async.parallel([
                            function(cb) {
                                client.zscore('testChannelTouch:pending', responseUuid, function(err, score) {
                                    expect(score).to.be.null;
                                    cb(err);
                                })
                            },
                            function(cb) {
                                client.llen('testChannelTouch:reserved', function(err, len) {
                                    expect(len).to.equal(0);
                                    cb(err);
                                })
                            },
                            function(cb) {
                                client.hexists('testChannelTouch:data', responseUuid, function(err, res) {
                                    expect(res).to.not.be.ok;
                                    cb(err);
                                })
                            }
                        ], function(err) {
                            done(err);
                        })
                    }
                })
            });

            it('removes uuid and data on a post-tick reserved message', function(done) {
                datastore.tick(100, function(err) {
                    if (err) {
                        return done(err);
                    }

                    datastore.delete('testChannelTouch', responseUuid, function(err) {
                        if (err) {
                            return done(err);
                        } else {
                            async.parallel([
                                function(cb) {
                                    client.zscore('testChannelTouch:pending', responseUuid, function(err, score) {
                                        expect(score).to.be.null;
                                        cb(err);
                                    })
                                },
                                function(cb) {
                                    client.llen('testChannelTouch:reserved', function(err, len) {
                                        expect(len).to.equal(0);
                                        cb(err);
                                    })
                                },
                                function(cb) {
                                    client.hexists('testChannelTouch:data', responseUuid, function(err, res) {
                                        expect(res).to.not.be.ok;
                                        cb(err);
                                    })
                                }
                            ], function(err) {
                                done(err);
                            })
                        }
                    })
                })
            });

            it('null channel is an error', function(done) {
                datastore.delete(null, responseUuid, function(err) {
                    expect(err).to.be.ok;
                    done();
                })
            });

            it('null uuid is an error', function(done) {
                datastore.delete('testChannelTouch', null, function(err) {
                    expect(err).to.be.ok;
                    done();
                })
            });

        });


    });

    describe('non-reserved message', function() {
        var responseUuid;
        before(function(done) {
            datastore.send('testChannel', new Buffer('€100', 'utf8'), function(err, response) {
                responseUuid = response;
                done(err);
            });
        });
        after(function(done) {
            client.flushdb(function(err) {
                done(err);
            })
        });
        it("delete removes the message", function(done) {
            datastore.delete('testChannel', responseUuid, function(err) {
                if (err) {
                    return done(err);
                } else {
                    async.parallel([
                        function(cb) {
                            client.zscore('testChannel:pending', responseUuid, function(err, score) {
                                expect(score).to.be.null;
                                cb(err);
                            })
                        },
                        function(cb) {
                            client.llen('testChannel:reserved', function(err, len) {
                                expect(len).to.equal(0);
                                cb(err);
                            })
                        },
                        function(cb) {
                            client.hexists('testChannel:data', responseUuid, function(err, res) {
                                expect(res).to.not.be.ok;
                                cb(err);
                            })
                        }
                    ], function(err) {
                        done(err);
                    })
                }
            })
        });
    });

    describe('low-level integration test', function() {
        it('200 messages of 1k, receive then delete', function(done) {
            var messages = {};
            var buffTemplate = new Buffer(1024);
            async.series([
                function(cb) {
                    var n = 0;
                    async.whilst(function() {return n < 200}, function(cb2) {
                        buffTemplate.writeUInt32LE(n, 0);
                        datastore.send('channel', buffTemplate, function(err, uuid) {
                            messages[n] = true;
                            n++;
                            cb2(err);
                        })
                    }, function(err) {
                        cb(err);
                    })
                },
                function(cb) {
                    var n = 0;
                    async.whilst(function() {return n < 200}, function(cb2) {
                        datastore.tick(n, function(err) {
                            if (err) {
                                throw err
                            }
                        })
                        datastore.receive('channel', 15, function(err, response) {
                            if (err) {
                                return cb2(err);
                            }
                            delete messages[n];
                            n++;

                            datastore.delete('test', response.uuid, function(err) {
                                return cb2(err);
                            })
                        })
                    }, function(err) {
                        cb(err);
                    })
                }
            ], function(err) {
                expect(messages).to.be.empty;
                done(err);
            })
        })
    });

    describe('populated put / take channel', function() {
        var putResponse;
        var messageUUID;
        var send;
        var sendCalled;
        var sendChannel;
        var sendMessage;

        var deleteFn;
        var deleteCalled;
        var deleteChannel;
        var deleteUUID;

        beforeEach(function(done) {
            send = datastore.send;
            sendCalled = false;
            datastore.send = function(channel, message, cb) {
                sendChannel = channel;
                sendMessage = message;
                send.call(datastore, channel, message, function(err, uuid) {
                    messageUUID = uuid;
                    sendCalled = true;
                    cb(err, uuid);
                })
            };

            deleteFn = datastore.delete;
            datastore.delete = function(channel, uuid, cb) {
                deleteChannel = channel;
                deleteUUID = uuid;
                deleteCalled = true;
                deleteFn.call(datastore, channel, uuid, function(err, response) {
                    cb(err, response);
                });
            };

            datastore.put('testChannel', new Buffer('€100', 'utf8'), function(err, response) {
                putResponse = response;
                done(err);
            });
        });

        afterEach(function(done) {
            datastore.send = send;
            datastore.delete = deleteFn;
            client.flushdb(function(err) {
                done(err);
            })
        });

        describe('put', function() {
            it('calls send', function() {
                expect(sendCalled).to.be.true;
            });

            it('adds the uuid to the stored data', function(done) {
                client.hget(new Buffer('testChannel:data'), messageUUID, function(err, data) {
                    if (err) {
                        done(err);
                    } else {
                        var splitUUID = UUID.unparse(data.slice(0,16));
                        expect(splitUUID).to.equal(putResponse.uuid);
                        done();
                    }
                })
            });

            it('locks the response channel', function(done) {
                client.exists(putResponse.uuid, function(err, res) {
                    expect(err).to.not.be.ok;
                    expect(res).to.equal(1);
                    done();
                })
            });
        });

        describe('respond', function() {
            describe('reserved message pre-tick', function() {
                var takeResponse;
                var requestUUID;
                beforeEach(function(done) {
                    requestUUID = messageUUID;
                    async.series([
                        function(cb) {
                            datastore.take('testChannel', 1, function(err, response) {
                                takeResponse = response;
                                cb(err);
                            })
                        },
                        function(cb) {
                            sendCalled = false;
                            deleteCalled = false;
                            datastore.respond('testChannel', takeResponse.request, new Buffer('response', 'utf8'), function(err) {
                               cb(err);
                            });
                        }
                    ], done);

                });
                it('calls send on the response channel', function() {
                    expect(sendCalled).to.be.true;
                    expect(sendChannel).to.equal(putResponse.uuid);
                    expect(sendMessage.toString('utf8')).to.equal('response');
                });
                it('calls delete on the request channel', function() {
                    expect(deleteCalled).to.be.true;
                    expect(deleteChannel).to.equal('testChannel');
                });
            })
        });
    });

    describe('take', function() {
        var receive;
        var receiveCalled;
        var messageUUID;
        var putResponse;
        var takeResponse;

        beforeEach(function(done) {
            receive = datastore.receive;
            receiveCalled = false;
            datastore.receive = function(channel, timeout, cb) {
                receive.call(datastore, channel, timeout, function(err, response) {
                    receiveCalled = true;
                    messageUUID = response.uuid;
                    cb(err, response);
                })
            };

            async.series([
                function(cb) {
                    datastore.put('testChannel', new Buffer('€100', 'utf8'), function(err, response) {
                        putResponse = response;
                        cb(err);
                    })
                },
                function(cb) {
                    datastore.take('testChannel', 1, function(err, response) {
                        takeResponse = response;
                        cb(err);
                    })
                }
            ], function(err) {
                done(err);
            });
        });

        afterEach(function(done) {
            datastore.receive = receive;
            client.flushdb(function(err){
                done(err);
            })
        });

        it('calls receive', function() {
            expect(receiveCalled).to.be.true;
        });

        it('returns the data sent', function() {
            expect(takeResponse).to.be.ok;
            expect(takeResponse.data.toString('utf8')).to.equal('€100');
        });

        it('returns the correct uuid', function() {
            expect(takeResponse.request).to.equal(messageUUID);
        });
    });
});

