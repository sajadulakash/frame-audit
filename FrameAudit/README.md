# FrameAudit

## Overview

FrameAudit is a FastAPI web app for annotators who need to review images after completing annotation work in CVAT. If an annotator notices that an image was annotated incorrectly or should not be part of the dataset, they can open this tool, review the images one by one, and delete the wrong image.

The image files stay on the local machine and are not stored in this repository. The app reads the image folders from the path set in `IMAGE_REVIEW_DATA_DIR`. Deleted images are moved into a `deleted/` folder instead of being permanently removed.

## Quick Start

```bash
cd ~/Desktop/model-development/FrameAudit
pip install -r requirements.txt
export IMAGE_REVIEW_DATA_DIR="/path/to/unknown-products"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Features

- Separate review folders for four annotators/users.
- One-image-at-a-time review interface.
- Previous and next image navigation.
- Delete wrong images by moving them into `deleted/`.
- Undo the most recent delete.
- Auto-generated `images.yaml` index for each image folder.
- Browser remembers the selected user and current image.

## Project Structure

```text
FrameAudit/
├── .gitignore
├── README.md
├── main.py
├── requirements.txt
└── static/
    ├── app.js
    ├── index.html
    └── styles.css
```
