var fs = require('fs');
var rtfd = require('./lib/rtfd');

exports = module.exports = function (source, fn) {
  fs.stat(source, function (err, stat) {
    if (stat.isDirectory()) {
      rtfd(source).call('toHTML').nodeify(fn);
    } else {
      fn(new TypeError('Expected a directory'));
    }
  });
};

exports.rtfd = rtfd;
