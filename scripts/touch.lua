--
-- Created by IntelliJ IDEA.
-- User: bwarminski
-- Date: 4/13/14
-- Time: 5:48 PM
-- To change this template use File | Settings | File Templates.
-- KEYS: channel:reserved channel:pending channel:ttl channel:data
-- ARGS: uuid, now

local reserved = KEYS[1]
local pending = KEYS[2]
local ttl = KEYS[3]
local uuid = ARGV[1]
local now = tonumber(ARGV[2])
local dataMap = KEYS[4]

local channelTtl = redis.call('GET', ttl)
if channelTtl then channelTtl = tonumber(channelTtl) end
if not channelTtl then channelTtl = 1000 end

local newTtl = channelTtl + now

-- Try to incr pending first
local zscore = redis.call('ZSCORE', pending, uuid)
local removed = 0
if not zscore then
    -- Try to remove from the list and add it to pending with the new ttl
    removed = redis.call('LREM', reserved, 0, uuid)
end
local success = zscore or tonumber(removed) ~= 0
if success then
    redis.call('ZADD', pending, newTtl, uuid)
    return redis.call('HGET', dataMap, uuid);
end
return nil