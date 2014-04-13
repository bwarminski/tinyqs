--
-- Created by IntelliJ IDEA.
-- User: bwarminski
-- Date: 4/5/14
-- Time: 9:51 PM
-- To change this template use File | Settings | File Templates.
-- KEYS: data:uuid uuid
-- ARGS: response

local data = KEYS[1]
local uuid = KEYS[2]
local respone = ARGV[1]

local len = redis.call('LLEN', uuid)
if len == 0 then
    redis.call('HDEL', data, uuid)
    redis.call('LPUSH', uuid, response)
end
return len



