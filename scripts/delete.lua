--
-- Created by IntelliJ IDEA.
-- User: bwarminski
-- Date: 4/6/14
-- Time: 5:02 PM
-- To change this template use File | Settings | File Templates.
--
-- KEYS: channel:reserved, channel:active, channel:pending, channel:data
-- ARGS: uuid

local reserved = KEYS[1]
local active = KEYS[2]
local pending = KEYS[3]
local data = KEYS[4]
local uuid = ARGV[1]

local removed = redis.call('ZREM', pending, uuid)
if removed == 0 then
    removed = redis.call('LREM', reserved, 0, uuid)
    if removed == 0 then
        removed = redis.call('LREM', active, 0, uuid)
    end
end
if removed == 1 then
    redis.call('HDEL', data, uuid)
end
return removed