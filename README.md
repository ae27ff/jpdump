# jpdump
JPEG Header Viewer in Javascript

Open `index.html` directly; no build step or package installation is needed.

- **Inspect** shows structure, segments, metadata and original bytes.
  Select a DHT segment and choose **Download mappings CSV** to export its Huffman
  tables, symbol values, code lengths and binary codewords in stored order.
  On an SOS or stored scan-data row, **Download Huffman values** exports one byte
  per decoded Huffman symbol in entropy order (DC category or AC run/size).
  Value bits, progressive refinement bits, padding, stuffing and restart markers
  are consumed but omitted. DC refinement scans can produce an empty file.
  This uses strict baseline/progressive decoding with the reconstruction limits;
  earlier progressive scans must decode successfully. Unsupported coding modes
  do not offer this download.
- **Analyze** provides strings, file signatures, entropy, metadata tables and locations,
  ELA, channel/bit-plane views, level sweep, thumbnails, quantization tables,
  coefficient inspection and image reconstruction.
- **Analyze → Metadata** defaults to **Retrieve metadata**, a table of file details,
  image properties, comments and supported EXIF, IPTC, XMP, JFIF and Adobe fields.
  Choose **Export metadata CSV** to save the table with Source, Detail and Value columns.
  Choose **See Locations** for the observations report with links to Inspect.
- **Analyze → Embedded-file finder** searches comments, application metadata and
  trailing / unparsed data by default, including file signatures inside COM
  payloads. Matches identify the containing segment and original byte offset.
  For signatures without a verified end, downloads stop at the searched range's
  end (for example, the end of the comment). Choose **Whole file** to search
  encoded image data as well.
- **Compare** checks structure, metadata bytes, pixels or JPEG coefficients
  against another local file. Switching workspaces preserves the Inspect selection.

**Analyze → Recovery → Reconstruct image** decodes one baseline or progressive
Huffman JPEG (8-bit SOF0 or SOF2, grayscale or three components). Baseline images
use one scan containing all components. Progressive decoding supports spectral
selection, DC/AC refinement, scan-specific Huffman tables and restart intervals.
Recovery retains completed blocks and earlier progressive detail and accepts
missing end markers. After damaged progressive AC data, independent scans can
continue; refinements depending on the damaged band are skipped. Unfinished
progressive blocks are marked uncertain. Baseline recovery also attempts
restart-marker resynchronization. Choose full color or one component; advanced
options include strict mode, color interpretation, missing-pixel fill, pixel
limits, and explicit missing-table assumptions from a comparison image.
**Substitute invalid codewords**, enabled by default in Recover mode, replaces
invalid prefixes and codewords with invalid run/magnitude values using a nearby
valid table entry (at most two bit changes). It prefers fewer changes, then a
length closest to the rejected word/prefix. The substitution limit defaults to
256 per image (maximum 4,096). The report records source byte/bit positions,
original/replacement bits and symbols. Later alignment may be wrong; affected
baseline output and all available progressive output are marked uncertain.
Codeword substitution never invents missing entropy bits or marker bytes. Strict decoding and
Huffman-symbol exports never substitute codewords.
The yellow corruption notice offers **Recover image**, which opens reconstruction
and starts recovery immediately for the damaged image. Unsupported codecs still
report their decoding limitations in the recovery view.
Export PNG/BMP, a recovery report and a damage mask. Missing/uncertain regions
are labeled; reconstructed output does not certify pixel integrity. Arithmetic,
lossless, sequential multi-scan and four-component reconstruction are unsupported,
as are JPEG-LS and JPEG 2000 decoding.

When a JPEG signature or a complete surviving header chain appears after an
unverified prefix, Inspect shows the preceding bytes as unparsed and retains
the actual marker, scan and end-marker ranges. A missing prefix is shown with
unknown length; no absent bytes are added to the stored-byte table. These
recovered segments do not verify the format of an enclosing file or container.
Prefix searches are bounded to the first 8 MiB and 256 candidate marker chains.
Reconstruction’s **Recover available data** mode automatically restores a
missing SOI from surviving frame, table and scan headers. It skips the unverified
leading fragment and records the repair. **Advanced options → Missing headers →
Use comparison image for missing headers** additionally allows a comparison
image to supply a missing frame header, dimensions, coding tables and restart
interval. Surviving values are retained. A scan header must survive;
earlier progressive scan detail cannot be inferred from a later scan alone.
The recovery report records inserted headers and skipped byte ranges, with
events mapped to original source offsets. Guessed output is marked uncertain.

Analysis runs locally without modifying source bytes. Signature candidates,
ELA and coefficient statistics are exploratory tools, not steganography verdicts.
Quick analyses run when opened for images with a longest edge below 4,096 pixels,
and option changes update their results automatically. Byte searches also require
a scope of at most 8 MiB. Larger analyses, reconstruction and coefficient decoding
keep an explicit run button.

Run tests with `node --test js/tests/*.test.js`. The optional browser integration
test uses existing installations: set `JPDUMP_PLAYWRIGHT` to the Playwright
package path and `JPDUMP_BROWSER` to the browser executable to enable it.

Live demo: http://ae27ff.github.io/jpdump/
