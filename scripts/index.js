/**
 * Created by bwarminski on 4/6/14.
 */

var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var luamin = require('luamin');
var files = fs.readdirSync(__dirname);

var scripts = {};
_.each(files, function(filename) {
    if (filename.lastIndexOf('.lua') == filename.length-4) {
        var script = fs.readFileSync(path.join(__dirname, filename), {encoding: 'utf8'});
        scripts[filename.slice(0, -4)] = luamin.minify(script);
    }
});

exports.minified = scripts;