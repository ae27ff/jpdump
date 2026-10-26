/**
 * Register raw bytes, create downloads on demand and show bounded previews.
 */
class ContentView{
    static createBlob(data){
        var buf = BinaryUtils.stringToBuffer(data);
        //console.log(buf)
        //data=decodeURIComponent(escape(data));
        //data=unescape(encodeURIComponent(data));
        return new Blob([buf], {type: 'application/octet-stream;charset=utf-8;'});//TODO: IE is messing up file encoding!
    }

    static register(data){
        ContentView.data.push(data);
        return ContentView.data.length-1;
    }

    static downloadLink(data,filename,contentId){
        if(typeof contentId==='undefined') contentId=ContentView.register(data);
        var linkElem = document.createElement('a');
        linkElem.href='#';
        linkElem.setAttribute('download', filename);
        linkElem.setAttribute('onclick', 'return ContentView.download('+contentId+',this,'+ContentView.requestId+')');
        linkElem.innerHTML="Download Raw";
        return linkElem.outerHTML;
    }

    static download(contentId,linkElem,resultId){
        if(resultId!==ContentView.requestId || typeof ContentView.data[contentId]!=='string') return false;
        if(linkElem.getAttribute('data-blob-url')) return true;
        var dlData = ContentView.createBlob(ContentView.data[contentId]);
        if(navigator.msSaveBlob) {
            navigator.msSaveBlob(dlData,linkElem.getAttribute('download'));
            return false;
        }else{
            var dlURL = window.URL.createObjectURL(dlData);
            ContentView.downloadURLs.push(dlURL);
            linkElem.href = dlURL;
            linkElem.setAttribute('data-blob-url',dlURL);
            return true;
        }
    }

    static links(content){
        if(content==="") return "None";
        var contentId=ContentView.register(content);
        return '<a href="#" onclick="return ContentView.show('+contentId+',true,'+ContentView.requestId+')">View Hex</a> '+
            '<a href="#" onclick="return ContentView.show('+contentId+',false,'+ContentView.requestId+')">View Text</a> '+
            ContentView.downloadLink(content,'output.bin',contentId);
    }

    static show(contentId,asHex,resultId){
        if(resultId!==ContentView.requestId || typeof ContentView.data[contentId]!=='string') return false;
        var content=ContentView.data[contentId];
        var preview=content.substring(0,ContentView.MAX_PREVIEW);
        ContentView.showOverlay(asHex ? BinaryUtils.hexDump(preview,16) : preview,content.length,preview.length);
        return false;
    }

    static release(){
        for(var index=0;index<ContentView.downloadURLs.length;index++) window.URL.revokeObjectURL(ContentView.downloadURLs[index]);
        ContentView.downloadURLs=[];
        ContentView.data=[];
        ContentView.hideOverlay();
        document.getElementById('data-overlay-content').value='';
        document.getElementById('data-overlay-length').innerHTML='0';
    }

    static showOverlay(data,totalBytes,previewBytes){
        var el = document.getElementById('data-overlay');
        var el_text = document.getElementById('data-overlay-content');
        var el_len = document.getElementById('data-overlay-length');
        el_text.value = data;
        el_len.innerHTML = typeof totalBytes==='undefined' ? data.length :
            (previewBytes<totalBytes ? 'First '+previewBytes+' of '+totalBytes+' bytes; Download Raw for all data' : totalBytes+' bytes');
        el.style.display="block";
        if(typeof el.querySelector === 'function') {
            ContentView.returnFocus=document.activeElement;
            var close=el.querySelector('a');
            if(close) close.focus();
            el.onkeydown=function(event){
                if(event.key==='Escape'){ event.preventDefault(); ContentView.hideOverlay(); return; }
                if(event.key!=='Tab' || !close) return;
                if(event.shiftKey && document.activeElement===close){ event.preventDefault(); el_text.focus(); }
                else if(!event.shiftKey && document.activeElement===el_text){ event.preventDefault(); close.focus(); }
            };
        }
    }

    static hideOverlay(){
        var el = document.getElementById('data-overlay');
        el.style.display="none";
        if(ContentView.returnFocus && ContentView.returnFocus.isConnected && typeof ContentView.returnFocus.focus==='function') ContentView.returnFocus.focus();
        ContentView.returnFocus=null;
    }
}

ContentView.requestId=0;
ContentView.data=[];
ContentView.downloadURLs=[];
ContentView.MAX_PREVIEW=65536;
ContentView.returnFocus=null;
