const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectRoot, jpeg, segment } = require('./metadata-helpers');

function loadJPEG(overrides = {}) {
    const context = vm.createContext({ console: { log() {}, error() {} }, ...overrides });
    for (const file of ['jpeg_util.js', 'jpeg_header_names.js', 'jpeg_decode_app14.js',
        'jpeg_decode_sof0.js', 'jpeg_decode_sos.js', 'jpeg_decode_jfif.js',
        'jpeg_decode_exif.js', 'jpeg_decode.js']) {
        vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), context, { filename: file });
    }
    return context;
}

function parseJPEG(bytes, overrides) {
    return loadJPEG(overrides).processJPEG(bytes.toString('latin1'));
}

module.exports = { loadJPEG, parseJPEG, jpeg, segment };
