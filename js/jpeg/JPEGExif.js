/**
 * Identify EXIF application headers; the metadata reader decodes their TIFF data.
 */
class JPEGExif{
    static matches(content){
        return (content.substr(0,6)==="Exif\0\0");
    }

    static read(data){
        //stub because we will process with Exif.js instead
        return {}
    }
}
