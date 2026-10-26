/**
 * Prepare the page controls after the document has loaded.
 */
class UI{
    static load(){
        var upload=document.getElementById('upload');
        upload.addEventListener('change',ImageController.selectFile,false);
        upload.value='';
        Accordion.prepare();
        if(Inspector.mounted()) Inspector.init();
        else Branding.load('branding-bottom');
    }
}

Branding.init();
window.addEventListener('load',UI.load,false);
