--
-- Created by IntelliJ IDEA.
-- User: bwarminski
-- Date: 4/5/14
-- Time: 9:56 PM
-- To change this template use File | Settings | File Templates.
-- KEYS: channel:reserved channel:timed channel:active
-- ARGS: uuid

local reserved = KEYS[1]
local timed = KEYS[2]
local active = KEYS[3]
local uuid = ARGV[1]

local removed = redis.call('ZREM', timed, uuid)
if removed == 0 then
    removed = redis.call('LREM', reserved, 0, uuid)
    if removed == 0 then
        removed = redis.call('LREM', active, 0, uuid)
    end
end
return removed

