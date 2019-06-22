/*
* Copyright (C) 2019 Binner
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
    "JPDUMP_DESCRIPTION":"Visor de encabezados de JPEG",//note: a header is a section of an image file that contains data of an indicated length
    
    //UI information
    "UI_LANGUAGE":"Lenguaje",
    "UI_FILE_SELECT":"Elige un archivo para analizar:",
    "UI_IMAGE_PREVIEW":"Vista previa",
    "UI_CLOSE_SHORT":"[X]",
    "UI_CLOSE":"Cerrar",//as in closing a window of the interface
    "UI_DATA_VIEW":"Visualización de datos",//titles a window that displays data directly after the title, may be suffixed by a character count like (43244)
    "UI_EXPAND":"Ampliar",
    "UI_COLLAPSE":"Collapsar",
    
    //UI content links
    "UI_CONTENT_VIEW_HEX":"Ver Hex",//view data as hexadecimal representation of bytes
    "UI_CONTENT_VIEW_TEXT":"Ver Texto",//view data as textual representation of bytes
    "UI_CONTENT_DOWNLOAD":"Descargar los datos crudos",//download the data as a file
    
    //sections of data about a file
    "SECTION_TITLE":"{0} Información",//    ______ Information.   titles a section with information about _______ (that is, {0})
    "SECTION_TITLE_IMAGE_INFO":"Información de Imagen",//title for section of basic image details like size
    "SECTION_TITLE_IMAGE_HEADERS":"Encabezados de Imagen",//title for the list of headers in the image, may be suffixed by a count like (7)
    
    "SECTION_DETAIL_FILE_SIZE":"Tamaño",
    "SECTION_DETAIL_IMAGE_RESOLUTION":"Resolución de Imagen",
    "SECTION_DETAIL_IMAGE_SIZE":"Tamaño de los datos de la imagen",//titles the amount of bytes that belong to the image headers, no extraneous data
    "SECTION_DETAIL_EXTRANEOUS":"Datos extraños",//data that doesn't belong to the file section - generally it will have been appended onto the section to hide it.
    
    "SECTION_DETAIL_MARKER":"Identificacion del Marcador",//titles the number that identifies the JFIF header type ("Marcador" in standard), represented in hexadecimal
    "SECTION_DETAIL_OFFSET":"Offset",//note: 0-based position in data
    "SECTION_DETAIL_USES":"Uses",//list of potential uses (proper nouns mostly) for this data type
    
    "SECTION_DETAIL_HEADER_SIZE":"Tamaño del encabezado",//the length of the bytes that make up the header (marker+length)
    "SECTION_DETAIL_HEADER_INDICATED_LENGTH":"Longitud indicada",//the length of following data indicated by the header itself
    "SECTION_DETAIL_HEADER_ADJUSTED_LENGTH":"Longitud ajustada",//the length of following data after taking into account scanning behavior (continues until a marker)
    "SECTION_DETAIL_HEADER_SCANNED":"Escaneado",//indicates the length was adjusted due to scanning behavior
    "SECTION_DETAIL_VALUE_NONE":"Ninguno",//indicates there is none (or Not Present / Not Applicable as opposed to 0) of the information specified
    "SECTION_DETAIL_VALUE_NO_CONTENT":"no hay contenido",//indicates there is header has no content in standard, given as a reason for the None.
    
    "SECTION_DETAIL_CONTENT":"Contenido",//the contained data in the section
    "SECTION_DETAIL_CONTENT_LENGTH":"Longitud del contenido",
    "SECTION_DETAIL_CONTENT_TYPE":"Tipo de contenido",
    
    //these are the standard names of header types for jpeg images - they can be translated but special care should be taken to preserve meaning.
    //note: coding usually refers to representation as bits, not programming, tables are generally lists of corresponding data
    "JFIF_MARKER_STUFF":"Stuffed FF",//"Stuffing" refers to encoding embedded FF bytes in data into FF00 making them a "Stuffed FF"
    "JFIF_MARKER_J2K_SOC": "Inicio de Codestream",
    "JFIF_MARKER_J2K_SIZ": "Tamaño de imagen y mosaico",
    "JFIF_MARKER_J2K_COD": "Estilo de codificación predeterminado",
    "JFIF_MARKER_J2K_COC": "Componente de estilo de codificación",
    "JFIF_MARKER_J2K_TLM": "Encabezado principal de longitudes de pieza de mosaico",
    "JFIF_MARKER_J2K_PLM": "Longitud del paquete encabezado principal",
    "JFIF_MARKER_J2K_PLT": "Longitud del paquete, encabezado de la parte del mosaico",
    "JFIF_MARKER_J2K_QCD": "Cuantización predeterminada",
    "JFIF_MARKER_J2K_QCC": "Componente de cuantificación",
    "JFIF_MARKER_J2K_RGN": "Región de Interés",
    "JFIF_MARKER_J2K_POD": "Orden de progresion predeterminada",
    "JFIF_MARKER_J2K_PPM": "Cabezal principal de cabezales de paquetes",
    "JFIF_MARKER_J2K_PPT": "Cabezales de paquetes, Encabezado de pieza de mosaico",
    "JFIF_MARKER_J2K_CME": "Comentario y extensión",
    "JFIF_MARKER_J2K_SOT": "Inicio de la parte de mosaico",
    "JFIF_MARKER_J2K_SOP": "Inicio del Paquete",
    "JFIF_MARKER_J2K_EPH": "Fin del encabezado del paquete",
    "JFIF_MARKER_J2K_SOD": "Inicio de datos",
    "JFIF_MARKER_SOF0": "Inicio del marco DCT 0",
    "JFIF_MARKER_SOF1": "Inicio del marco DCT 1",
    "JFIF_MARKER_SOF2": "Inicio del marco DCT 2",
    "JFIF_MARKER_SOF3": "Inicio del marco DCT 3",
    "JFIF_MARKER_DHT": "Tabla de Huffman",
    "JFIF_MARKER_SOF5": "Inicio del marco diferencial 5",
    "JFIF_MARKER_SOF6": "Inicio del marco diferencial 6",
    "JFIF_MARKER_SOF7": "Inicio del marco diferencial 7",
    "JFIF_MARKER_JPG": "Extensiones",
    "JFIF_MARKER_SOF9": "Inicio del marco de codificación aritmética 9",
    "JFIF_MARKER_SOF10": "Inicio del marco de codificación aritmética 10",
    "JFIF_MARKER_SOF11": "Inicio del marco de codificación aritmética 11",
    "JFIF_MARKER_DAC": "Codificación aritmética",
    "JFIF_MARKER_SOF13": "Inicio del marco diferencial/aritmético 13",
    "JFIF_MARKER_SOF14": "Inicio del marco diferencial/aritmético 14",
    "JFIF_MARKER_SOF15": "Inicio del marco diferencial/aritmético 15",
    "JFIF_MARKER_RST0": "Marcador de reinicio 0",
    "JFIF_MARKER_RST1": "Marcador de reinicio 1",
    "JFIF_MARKER_RST2": "Marcador de reinicio 2",
    "JFIF_MARKER_RST3": "Marcador de reinicio 3",
    "JFIF_MARKER_RST4": "Marcador de reinicio 4",
    "JFIF_MARKER_RST5": "Marcador de reinicio 5",
    "JFIF_MARKER_RST6": "Marcador de reinicio 6",
    "JFIF_MARKER_RST7": "Marcador de reinicio 7",
    "JFIF_MARKER_SOI": "Inicio de la imagen",
    "JFIF_MARKER_EOI": "Fin de la imagen/fin de Codestream",
    "JFIF_MARKER_SOS": "Inicio del análisis",
    "JFIF_MARKER_DQT": "Tabla de cuantificación",
    "JFIF_MARKER_DNL": "Número de líneas",
    "JFIF_MARKER_DRI": "Intervalo de reinicio",
    "JFIF_MARKER_DHP": "Progreso jerárquico",
    "JFIF_MARKER_EXP": "Expandir componente de referencia",
    "JFIF_MARKER_APP0": "Segmento de aplicación 0",
    "JFIF_MARKER_APP1": "Segmento de aplicación 1",
    "JFIF_MARKER_APP2": "Segmento de aplicación 2",
    "JFIF_MARKER_APP3": "Segmento de aplicación 3",
    "JFIF_MARKER_APP4": "Segmento de aplicación 4",
    "JFIF_MARKER_APP5": "Segmento de aplicación 5",
    "JFIF_MARKER_APP6": "Segmento de aplicación 6",
    "JFIF_MARKER_APP7": "Segmento de aplicación 7",
    "JFIF_MARKER_APP8": "Segmento de aplicación 8",
    "JFIF_MARKER_APP9": "Segmento de aplicación 9",
    "JFIF_MARKER_APP10": "Segmento de aplicación 10",
    "JFIF_MARKER_APP11": "Segmento de aplicación 11",
    "JFIF_MARKER_APP12": "Segmento de aplicación 12",
    "JFIF_MARKER_APP13": "Segmento de aplicación 13",
    "JFIF_MARKER_APP14": "Segmento de aplicación 14",
    "JFIF_MARKER_APP15": "Segmento de aplicación 15",
    "JFIF_MARKER_JPG0": "Extensión 0",
    "JFIF_MARKER_JPG1": "Extensión 1",
    "JFIF_MARKER_JPG2": "Extensión 2",
    "JFIF_MARKER_JPG3": "Extensión 3",
    "JFIF_MARKER_JPG4": "Extensión 4",
    "JFIF_MARKER_JPG5": "Extensión 5",
    "JFIF_MARKER_JPG6": "Extensión 6",
    "JFIF_MARKER_JPG7_SOF48": "Extensión 7",
    "JFIF_MARKER_JPG8_LSE": "Extensión 8",
    "JFIF_MARKER_JPG9": "Extensión 9",
    "JFIF_MARKER_JPG10": "Extensión 10",
    "JFIF_MARKER_JPG11": "Extensión 11",
    "JFIF_MARKER_JPG12": "Extensión 12",
    "JFIF_MARKER_JPG13": "Extensión 13",
    "JFIF_MARKER_COM": "Comentario",
    
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

