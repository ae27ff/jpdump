# jpdump
JPEG Header Viewer in Javascript

Live demo: http://ae27ff.github.io/jpdump/

## Overview

Open `index.html` in your browser and choose an image. No build step or package
installation is needed. Files are processed locally, and the original bytes stay
unchanged.

- **Inspect** breaks down the file's structure, metadata and raw bytes to help
  identify extra or unusual data.
- **Analyze** explores the file with byte searches, metadata reports and image
  views, and can attempt to reconstruct damaged JPEG images.
- **Compare** shows differences between two files, including their structure,
  metadata and image content.

Results and recovered images can be downloaded. Recovery is best effort, and
analysis findings are clues to investigate rather than proof of hidden content.
