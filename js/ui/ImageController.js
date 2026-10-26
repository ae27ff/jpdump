/**
 * Manage file selection, preview requests and cached metadata.
 */
class ImageController{
    static selectFile(evt){
        var files = evt.target.files; // FileList object

        // use the 1st file from the list
        var f = files[0];
        if(!f) return;
        var requestId = ++ImageController.requestId;
        ImageController.sequence=JPEGSequence.isSequenceFile(f.name);
        ImageController.exifCache=null;
        ImageController.exifCacheData=null;
        if(typeof Inspector !== 'undefined' && Inspector.mounted()) Inspector.beginFile(f);

        var reader = new FileReader();

        // Capture the selection so an older read cannot replace a newer image.
        reader.onload = function(e){
            if(requestId !== ImageController.requestId) return;

            var result=null;
            if(typeof e.target.result === "undefined" || e.target.result===null){
                result=e.target.content;//IE11
            }else{
                result=e.target.result;
            }
            ImageController.data=typeof result==='string' ? result : BinaryUtils.arrayToString(new Uint8Array(result));
            var info=JPEGParser.parse(ImageController.data,{sequence:ImageController.sequence});
            var first=info.images[0];
            var previewData=info.images.length>1 ? ImageController.data.substring(first.start,first.end) : ImageController.data;
            ImageController.preview(previewData,requestId,info);
        };
        reader.onerror = function(){
            if(requestId !== ImageController.requestId) return;
            ImageController.data='';
            ++ContentView.requestId;
            ContentView.release();
            document.getElementById('preview').removeAttribute('src');
            if(typeof Inspector !== 'undefined' && Inspector.mounted()) Inspector.failFile('Unable to read the selected file.');
            else document.getElementById('image').innerHTML='<p class="warning">Unable to read the selected file.</p>';
        };
        reader.readAsArrayBuffer(f);

        // Read in the image file as a data URL.
        //reader.readAsText(f);
    }

    static process(info){
        ResultView.render(info || JPEGParser.parse(ImageController.data,{sequence:ImageController.sequence}));
    }

    static getEXIF(image){
        if(image){
            if(!image.exif) image.exif=EXIF.readFromBinaryFile(BinaryUtils.stringToBuffer(ImageController.data.substring(image.start,image.end))) || {};
            return image.exif;
        }
        if(ImageController.exifCache===null || ImageController.exifCacheData!==ImageController.data){
            ImageController.exifCache=EXIF.readFromBinaryFile(BinaryUtils.stringToBuffer(ImageController.data)) || {};
            ImageController.exifCacheData=ImageController.data;
        }
        return ImageController.exifCache;
    }

    static getPreviewEXIF(parent,image){
        ResultView.addPreviewEXIF(parent,ImageController.getEXIF(image));
    }

    static preview(data,requestId,info){
        if(typeof requestId === 'undefined') requestId = ImageController.requestId;
        var img=document.getElementById('preview');
        var onComplete = function(){
            if(requestId === ImageController.requestId) {
                if(typeof Inspector !== 'undefined' && Inspector.mounted()) Inspector.previewReady(img.naturalWidth>0);
                ImageController.process(info);
            }
        };
        img.onload=onComplete;
        img.onerror=onComplete;
        img.src="data:application/jpeg;base64," + btoa(data);
    }

    static getPreviewDimensions(){
        var img=document.getElementById('preview');
        return img.naturalWidth+"x"+img.naturalHeight
    }
}

ImageController.data="";
ImageController.requestId=0;
ImageController.sequence=false;
ImageController.exifCache=null;
ImageController.exifCacheData=null;
