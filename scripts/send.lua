--
-- Created by IntelliJ IDEA.
-- User: bwarminski
-- Date: 4/6/14
-- Time: 4:32 PM
-- To change this template use File | Settings | File Templates.
-- KEYS: channel:active, channel:data
-- ARGS: uuid data

local channel = KEYS[1]
local dataMap = KEYS[2]
local uuid = ARGV[1]
local data = ARGV[2]

local notExists = redis.call('HSETNX', dataMap, uuid, data)
if notExists then
    redis.call('LPUSH', channel, uuid)
end
return notExists
