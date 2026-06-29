# FrameAudit

## Overview

FrameAudit is a FastAPI web app for annotators who need to review images after completing annotation work in CVAT. Visitors can continue as an annotator or admin. Annotators select their folder, review images one by one, and remove incorrect images. Admin access requires credentials configured in the local .env file.

The image files stay on the local machine and are not stored in this repository. The app reads the image folders from IMAGE_REVIEW_DATA_DIR. Deleted images are moved into a deleted/ folder instead of being permanently removed.

## Quick Start

~~~bash
cd ~/Desktop/model-development/FrameAudit
pip install -r requirements.txt
~~~

Create a local .env file:

~~~env
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-admin-password
IMAGE_REVIEW_DATA_DIR=/path/to/unknown-products
~~~

Run the project:

~~~bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
~~~

Open http://127.0.0.1:8000.

## Features

- Role selection for annotator and admin access.
- Admin login using credentials stored in .env.
- Separate review folders for four annotators.
- One-image-at-a-time review with previous and next navigation.
- Delete wrong images by moving them into deleted/.
- Undo the most recent delete.
- Auto-generated images.yaml index for each image folder.
- Browser remembers the current image for each folder.

## Project Structure

~~~text
FrameAudit/
├── .gitignore
├── README.md
├── main.py
├── requirements.txt
└── static/
    ├── app.js
    ├── index.html
    └── styles.css
~~~
