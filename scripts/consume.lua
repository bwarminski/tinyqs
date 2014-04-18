--
-- Created by IntelliJ IDEA.
-- User: bwarminski
-- Date: 4/14/14
-- Time: 12:06 AM
-- To change this template use File | Settings | File Templates.
-- KEYS: channel:reserved channel:pending channel:active responseUUID channel:ttl

local reserved = KEYS[1]
local pending = KEYS[2]
local active = KEYS[3]
local lock = KEYS[4]
local ttl = KEYS[5]

local channelTtl = redis.call('GET', ttl)
if channelTtl then channelTtl = tonumber(channelTtl) * 10 end
if not channelTtl then channelTtl = 10000 end

redis.call('PEXPIRE', reserved, channelTtl)
redis.call('PEXPIRE', pending, channelTtl)
redis.call('PEXPIRE', active, channelTtl)
redis.call('PEXPIRE', lock, channelTtl)

