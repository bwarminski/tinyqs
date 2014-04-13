--
-- Created by IntelliJ IDEA.
-- User: bwarminski
-- Date: 4/6/14
-- Time: 5:16 PM
-- To change this template use File | Settings | File Templates.
-- KEYS: channel:reserved channel:pending channel:active channel:ttl
-- ARGS: now

-- Remove all from reserved and place in pending with now+ttl

local reserved = KEYS[1]
local pending = KEYS[2]
local active = KEYS[3]
local ttl = KEYS[4]
local now = tonumber(ARGV[1])

local channelTtl = redis.call('GET', ttl)
if channelTtl then channelTtl = tonumber(channelTtl) end
if not channelTtl then channelTtl = 1000 end

local newTtl = channelTtl + now

local val = redis.call('RPOP', reserved)
while val do
    redis.call('ZADD', pending, newTtl, val);
    val = redis.call('RPOP', reserved)
end

-- Get all from reserved < now and place into active

for index, value in pairs(redis.call('ZREVRANGEBYSCORE', pending, now, '-inf')) do
    redis.call('RPUSH', active, value)
    redis.call('ZREM', pending, value)
end
