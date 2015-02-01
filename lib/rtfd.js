var Promise = require('bluebird');
var fs = require('fs');
var mime = require('mime');
var path = require('path');
var readDirectory = Promise.promisify(fs.readdir);
var readFile = Promise.promisify(fs.readFile);
var unrtf = Promise.promisify(require('unrtf'));
var uuid = require('uuid');

// Regular expression for image type
var IMAGE_TYPE = /^image\//;

// Regular expression for NeXTGraphic
var NEXT_GRAPHIC = /{{\\NeXTGraphic (.*) \\width\d+ \\height\d+\s?}.?}/g;

exports = module.exports = function rtfd(directory) {
  return new Promise(function (resolve, reject) {
    // Read bundle directory
    var bundle = readDirectory(directory)
      .then(function (filenames) {
        var index = filenames.indexOf('TXT.rtf');

        // Ensure TXT.rtf exists
        if (index === -1) throw new Error('Expected TXT.rtf');

        // Get full path to each file
        var files = Promise.map(filenames, function (filename) {
          return path.resolve(directory, filename);
        });

        // Return files, with index of rtf
        return [files, index];
      })
      .catch(reject);

    // List attachments in RTFD
    var attachments = bundle.spread(function (files, index) {
      // Remove TXT.rtf
      return files.slice(0, index).concat(files.slice(index + 1));
    });

    // Tokenize each attachment
    var tokens = attachments.map(function () {
      return '![[' + uuid() + ']]';
    });

    // Read TXT.rtf's contents
    var rtf = bundle.spread(function (files, index) {
      return readFile(files[index], 'utf8').catch(reject);
    });

    // Resolve with RTFD
    resolve({
      toHTML: function () {
        return Promise.join(rtf, attachments, tokens, function (rtf, attachments, tokens) {
          // Filenames of attachments
          var filenames = attachments.map(path.basename);

          // Replace attachments with tokens
          var intermediary = rtf.replace(NEXT_GRAPHIC, function (_, filename) {
            var index = filenames.indexOf(filename);

            // Ensure attachment exists
            if (index === -1) throw new Error('Unexpected attachment: ' + filename);

            return tokens[index];
          });

          // Convert to HTML
          var content = unrtf(intermediary)
            .then(function (result) {
              return result.html;
            })
            .done();

          // Identify each attachment's mime type
          var types = attachments.map(function (attachment) {
            return mime.lookup(attachment);
          });

          // Read in each attachment, transforming its contents into Base64
          var images = Promise
            .map(attachments, function (attachment) {
              return readFile(attachment);
            })
            .map(function (buffer) {
              return buffer.toString('base64');
            })
            .done();

          // Finalize conversion
          return Promise.join(content, types, images, function (content, types, images) {
            // Replace images with <img> tags containing inline data URIs
            var body = tokens.reduce(function (html, token, i) {
              if (!types[i].match(IMAGE_TYPE)) {
                return html.replace(token, '');
              } else {
                return html.replace(token, '<img src="data:' + types[i] + ';base64,' + images[i] + '"/>');
              }
            }, content);

            // Wrap body in <html> and <body> tags
            var html = '<html><body>' + body + '</body></html>';

            return html;
          });
        });
      }
    });
  });
};
