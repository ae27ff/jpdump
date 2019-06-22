/* 
 * Copyright (C) 2019 your-name-here (optional-public-email)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

if(typeof i18n==='undefined') i18n={};//suppress IDE warning

//localizations
i18n.localizations.addLocale('es_EC',"Español ecuatoriano");//note: please translate also the name
i18n.localizations.addLocalizations('es_EC',{
    //application-specific informaion
    "JPDUMP_TITLE":"jpdump",
    "JPDUMP_DESCRIPTION":"JPEG Header Viewer",//note: a header is a section of an image file that contains data of an indicated length
    
    //UI information
    "UI_LANGUAGE":"Language",
    "UI_FILE_SELECT":"Select a file to analyze:",
    "UI_IMAGE_PREVIEW":"Image Preview",
    "UI_CLOSE_SHORT":"[X]",
    "UI_CLOSE":"Close",//as in closing a window of the interface
    "UI_DATA_VIEW":"Viewing Data",//titles a window that displays data directly after the title, may be suffixed by a character count like (43244)
    "UI_EXPAND":"Expand",
    "UI_COLLAPSE":"Collapse",
    
    //UI content links
    "UI_CONTENT_VIEW_HEX":"View Hex",//view data as hexadecimal representation of bytes
    "UI_CONTENT_VIEW_TEXT":"View Text",//view data as textual representation of bytes
    "UI_CONTENT_DOWNLOAD":"Download Raw",//download the data as a file
    
    //sections of data about a file
    "SECTION_TITLE":"{0} Information",//    ______ Information.   titles a section with information about _______ (that is, {0})
    "SECTION_TITLE_IMAGE_INFO":"Image Info",//title for section of basic image details like size
    "SECTION_TITLE_IMAGE_HEADERS":"Image Headers",//title for the list of headers in the image, may be suffixed by a count like (7)
    
    "SECTION_DETAIL_FILE_SIZE":"Filesize",
    "SECTION_DETAIL_IMAGE_RESOLUTION":"Image Resolution",
    "SECTION_DETAIL_IMAGE_SIZE":"Image Data Size",//titles the amount of bytes that belong to the image headers, no extraneous data
    "SECTION_DETAIL_EXTRANEOUS":"Extraneous Data",//data that doesn't belong to the file section - generally it will have been appended onto the section to hide it.
    
    "SECTION_DETAIL_MARKER":"Marker ID",
    "SECTION_DETAIL_OFFSET":"Offset",//note: 0-based position in data
    "SECTION_DETAIL_USES":"Uses",//list of potential uses (proper nouns mostly) for this data type
    
    "SECTION_DETAIL_HEADER_SIZE":"Header Size",//the length of the bytes that make up the header (marker+length)
    "SECTION_DETAIL_HEADER_INDICATED_LENGTH":"Indicated Length",//the length of following data indicated by the header itself
    "SECTION_DETAIL_HEADER_ADJUSTED_LENGTH":"Adjusted Length",//the length of following data after taking into account scanning behavior (continues until a marker)
    "SECTION_DETAIL_HEADER_SCANNED":"Scanned",//indicates the length was adjusted due to scanning behavior
    "SECTION_DETAIL_VALUE_NONE":"None",//indicates there is none (or Not Present / Not Applicable as opposed to 0) of the information specified
    "SECTION_DETAIL_VALUE_NO_CONTENT":"no content",//indicates there is header has no content in standard, given as a reason for the None.
    
    "SECTION_DETAIL_CONTENT":"Content",//the contained data in the section
    "SECTION_DETAIL_CONTENT_LENGTH":"Content Length",
    "SECTION_DETAIL_CONTENT_TYPE":"Content Type",
    
    //these are the standard names of header types for jpeg images - they can be translated but special care should be taken to preserve meaning.
    //note: coding usually refers to representation as bits, not programming, tables are generally lists of corresponding data
    "JFIF_MARKER_STUFF":"Stuffed FF",//"Stuffing" refers to encoding embedded FF bytes in data into FF00 making them a "Stuffed FF"
    "JFIF_MARKER_J2K_SOC": "Start of Codestream",
    "JFIF_MARKER_J2K_SIZ": "Image and Tile-size",
    "JFIF_MARKER_J2K_COD": "Coding style Default",
    "JFIF_MARKER_J2K_COC": "Coding style Component",
    "JFIF_MARKER_J2K_TLM": "Tile-part Lengths Main Header",
    "JFIF_MARKER_J2K_PLM": "Packet Length Main Header",
    "JFIF_MARKER_J2K_PLT": "Packet Length Tile-part Header",
    "JFIF_MARKER_J2K_QCD": "Quantization Default",
    "JFIF_MARKER_J2K_QCC": "Quantization Component",
    "JFIF_MARKER_J2K_RGN": "Region of Interest",
    "JFIF_MARKER_J2K_POD": "Progression Order Default",
    "JFIF_MARKER_J2K_PPM": "Packed Packet-headers Main Header",
    "JFIF_MARKER_J2K_PPT": "Packed Packet-headers Tile-part header",
    "JFIF_MARKER_J2K_CME": "Comment and Extension",
    "JFIF_MARKER_J2K_SOT": "Start of Tile-part",
    "JFIF_MARKER_J2K_SOP": "Start of Packet",
    "JFIF_MARKER_J2K_EPH": "End of Packet Header",
    "JFIF_MARKER_J2K_SOD": "Start of Data",
    "JFIF_MARKER_SOF0": "Start of DCT Frame 0",
    "JFIF_MARKER_SOF1": "Start of DCT Frame 1",
    "JFIF_MARKER_SOF2": "Start of DCT Frame 2",
    "JFIF_MARKER_SOF3": "Start of DCT Frame 3",
    "JFIF_MARKER_DHT": "Huffman Table",
    "JFIF_MARKER_SOF5": "Start of Differential Frame 5",
    "JFIF_MARKER_SOF6": "Start of Differential Frame 6",
    "JFIF_MARKER_SOF7": "Start of Differential Frame 7",
    "JFIF_MARKER_JPG": "Extensions",
    "JFIF_MARKER_SOF9": "Start of Arithmetic-coding Frame 9",
    "JFIF_MARKER_SOF10": "Start of Arithmetic-coding Frame 10",
    "JFIF_MARKER_SOF11": "Start of Arithmetic-coding Frame 11",
    "JFIF_MARKER_DAC": "Arithmetic Coding",
    "JFIF_MARKER_SOF13": "Start of Differential/Arithmetic Frame 13",
    "JFIF_MARKER_SOF14": "Start of Differential/Arithmetic Frame 14",
    "JFIF_MARKER_SOF15": "Start of Differential/Arithmetic Frame 15",
    "JFIF_MARKER_RST0": "Restart Marker 0",
    "JFIF_MARKER_RST1": "Restart Marker 1",
    "JFIF_MARKER_RST2": "Restart Marker 2",
    "JFIF_MARKER_RST3": "Restart Marker 3",
    "JFIF_MARKER_RST4": "Restart Marker 4",
    "JFIF_MARKER_RST5": "Restart Marker 5",
    "JFIF_MARKER_RST6": "Restart Marker 6",
    "JFIF_MARKER_RST7": "Restart Marker 7",
    "JFIF_MARKER_SOI": "Start of Image",
    "JFIF_MARKER_EOI": "End of Image/End of Codestream",
    "JFIF_MARKER_SOS": "Start of Scan",
    "JFIF_MARKER_DQT": "Quantization Table",
    "JFIF_MARKER_DNL": "Number of Lines",
    "JFIF_MARKER_DRI": "Restart Interval",
    "JFIF_MARKER_DHP": "Hierarchical Progression",
    "JFIF_MARKER_EXP": "Expand Reference Component",
    "JFIF_MARKER_APP0": "Application Segment 0",
    "JFIF_MARKER_APP1": "Application Segment 1",
    "JFIF_MARKER_APP2": "Application Segment 2",
    "JFIF_MARKER_APP3": "Application Segment 3",
    "JFIF_MARKER_APP4": "Application Segment 4",
    "JFIF_MARKER_APP5": "Application Segment 5",
    "JFIF_MARKER_APP6": "Application Segment 6",
    "JFIF_MARKER_APP7": "Application Segment 7",
    "JFIF_MARKER_APP8": "Application Segment 8",
    "JFIF_MARKER_APP9": "Application Segment 9",
    "JFIF_MARKER_APP10": "Application Segment 10",
    "JFIF_MARKER_APP11": "Application Segment 11",
    "JFIF_MARKER_APP12": "Application Segment 12",
    "JFIF_MARKER_APP13": "Application Segment 13",
    "JFIF_MARKER_APP14": "Application Segment 14",
    "JFIF_MARKER_APP15": "Application Segment 15",
    "JFIF_MARKER_JPG0": "Extension 0",
    "JFIF_MARKER_JPG1": "Extension 1",
    "JFIF_MARKER_JPG2": "Extension 2",
    "JFIF_MARKER_JPG3": "Extension 3",
    "JFIF_MARKER_JPG4": "Extension 4",
    "JFIF_MARKER_JPG5": "Extension 5",
    "JFIF_MARKER_JPG6": "Extension 6",
    "JFIF_MARKER_JPG7_SOF48": "Extension 7",
    "JFIF_MARKER_JPG8_LSE": "Extension 8",
    "JFIF_MARKER_JPG9": "Extension 9",
    "JFIF_MARKER_JPG10": "Extension 10",
    "JFIF_MARKER_JPG11": "Extension 11",
    "JFIF_MARKER_JPG12": "Extension 12",
    "JFIF_MARKER_JPG13": "Extension 13",
    "JFIF_MARKER_COM": "Comment",
    
    "JFIF_MARKER_USES_STUFF": "Encodes embedded FF's inside content",
    "JFIF_MARKER_USES_J2K_SOC": "JPEG2000 Signature",
    "JFIF_MARKER_USES_J2K_SIZ": "",
    "JFIF_MARKER_USES_J2K_COD": "",
    "JFIF_MARKER_USES_J2K_COC": "",
    "JFIF_MARKER_USES_J2K_TLM": "",
    "JFIF_MARKER_USES_J2K_PLM": "",
    "JFIF_MARKER_USES_J2K_PLT": "",
    "JFIF_MARKER_USES_J2K_QCD": "",
    "JFIF_MARKER_USES_J2K_QCC": "",
    "JFIF_MARKER_USES_J2K_RGN": "",
    "JFIF_MARKER_USES_J2K_POD": "",
    "JFIF_MARKER_USES_J2K_PPM": "",
    "JFIF_MARKER_USES_J2K_PPT": "",
    "JFIF_MARKER_USES_J2K_CME": "",
    "JFIF_MARKER_USES_J2K_SOT": "",
    "JFIF_MARKER_USES_J2K_SOP": "",
    "JFIF_MARKER_USES_J2K_EPH": "",
    "JFIF_MARKER_USES_J2K_SOD": "",
    "JFIF_MARKER_USES_SOF0": "",
    "JFIF_MARKER_USES_SOF1": "",
    "JFIF_MARKER_USES_SOF2": "",
    "JFIF_MARKER_USES_SOF3": "",
    "JFIF_MARKER_USES_DHT": "",
    "JFIF_MARKER_USES_SOF5": "",
    "JFIF_MARKER_USES_SOF6": "",
    "JFIF_MARKER_USES_SOF7": "",
    "JFIF_MARKER_USES_JPG": "",
    "JFIF_MARKER_USES_SOF9": "",
    "JFIF_MARKER_USES_SOF10": "",
    "JFIF_MARKER_USES_SOF11": "",
    "JFIF_MARKER_USES_DAC": "",
    "JFIF_MARKER_USES_SOF13": "",
    "JFIF_MARKER_USES_SOF14": "",
    "JFIF_MARKER_USES_SOF15": "",
    "JFIF_MARKER_USES_RST0": "",
    "JFIF_MARKER_USES_RST1": "",
    "JFIF_MARKER_USES_RST2": "",
    "JFIF_MARKER_USES_RST3": "",
    "JFIF_MARKER_USES_RST4": "",
    "JFIF_MARKER_USES_RST5": "",
    "JFIF_MARKER_USES_RST6": "",
    "JFIF_MARKER_USES_RST7": "",
    "JFIF_MARKER_USES_SOI": "",
    "JFIF_MARKER_USES_EOI": "",
    "JFIF_MARKER_USES_SOS": "",
    "JFIF_MARKER_USES_DQT": "",
    "JFIF_MARKER_USES_DNL": "",
    "JFIF_MARKER_USES_DRI": "",
    "JFIF_MARKER_USES_DHP": "",
    "JFIF_MARKER_USES_EXP": "",
    "JFIF_MARKER_USES_APP0": "JFIF Header,JFIF Extensions,Motion JPEG",
    "JFIF_MARKER_USES_APP1": "EXIF,TIFF-IFD,Adobe XMP",
    "JFIF_MARKER_USES_APP2": "Color Profile,FlashPix",
    "JFIF_MARKER_USES_APP3": "JPS-Stereoscopic JPEG",
    "JFIF_MARKER_USES_APP4": "",
    "JFIF_MARKER_USES_APP5": "",
    "JFIF_MARKER_USES_APP6": "NITF Lossless profile",
    "JFIF_MARKER_USES_APP7": "",
    "JFIF_MARKER_USES_APP8": "",
    "JFIF_MARKER_USES_APP9": "",
    "JFIF_MARKER_USES_APP10": "ActiveObject multimedia",
    "JFIF_MARKER_USES_APP11": "JPEGH-HDR,HELIOS JPEG Resources,OPI Postscript",
    "JFIF_MARKER_USES_APP12": "Old digicam info,Photoshop Save for Web: Ducky",
    "JFIF_MARKER_USES_APP13": "Photoshop IRB,8BIM,IPTC",
    "JFIF_MARKER_USES_APP14": "Adobe DCT Information",
    "JFIF_MARKER_USES_APP15": "Adobe DCT Information",
    "JFIF_MARKER_USES_JPG0": "",
    "JFIF_MARKER_USES_JPG1": "",
    "JFIF_MARKER_USES_JPG2": "",
    "JFIF_MARKER_USES_JPG3": "",
    "JFIF_MARKER_USES_JPG4": "",
    "JFIF_MARKER_USES_JPG5": "",
    "JFIF_MARKER_USES_JPG6": "",
    "JFIF_MARKER_USES_JPG7_SOF48": "JPEG-LS Lossless JPEG",
    "JFIF_MARKER_USES_JPG8_LSE": "JPEG-LS Parameters",
    "JFIF_MARKER_USES_JPG9": "",
    "JFIF_MARKER_USES_JPG10": "",
    "JFIF_MARKER_USES_JPG11": "",
    "JFIF_MARKER_USES_JPG12": "",
    "JFIF_MARKER_USES_JPG13": "",
    "JFIF_MARKER_USES_COM": ""
    
});





//defaults
i18n.localizations.addDefaultLocale('es','Español', 'es_EC');

