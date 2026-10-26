const {loadScript}=require('./script-helpers');
const vm = require('node:vm');
const { jpeg, segment } = require('./metadata-helpers');

function loadJPEG(overrides = {}) {
    const context = vm.createContext({ console: { log() {}, error() {} }, ...overrides });
    for (const file of ['js/util/BinaryUtils.js', 'js/jpeg/JPEGMarkers.js', 'js/jpeg/JPEGAdobe.js',
        'js/jpeg/JPEGFrame.js', 'js/jpeg/JPEGScan.js', 'js/jpeg/JPEGJFIF.js',
        'js/jpeg/JPEGExif.js', 'js/jpeg/JPEGTable.js','js/jpeg/JPEGLS.js','js/jpeg/JPEG2000.js','js/jpeg/JPEGParser.js','js/jpeg/JPEGSequence.js']) {
        loadScript(context,file);
    }
    return context;
}

function parseJPEG(bytes, overrides) {
    return loadJPEG(overrides).JPEGParser.parse(bytes.toString('latin1'));
}

module.exports = { loadJPEG, parseJPEG, jpeg, segment };
