# FrameAudit

## Overview

FrameAudit is a React and FastAPI tool for reviewing images after CVAT annotation. Annotators can inspect their assigned folder and move incorrect images into a recoverable deleted folder. Administrators use environment-configured credentials.

Images remain on the local machine and are loaded from IMAGE_REVIEW_DATA_DIR.

## Quick Start

~~~bash
cd ~/Desktop/model-development/FrameAudit
pip install -r requirements.txt
cd frontend
npm install
npm run build
cd ..
~~~

Create .env:

~~~env
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-admin-password
IMAGE_REVIEW_DATA_DIR=/path/to/unknown-products
~~~

Run FrameAudit:

~~~bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
~~~

Open http://127.0.0.1:8000.

## Features

- React interface for annotator and administrator workflows.
- Browser Back navigation between application screens.
- Separate review folders for four annotators.
- Previous and next image navigation.
- Delete incorrect images into deleted/.
- Undo the most recent delete.
- Automatic images.yaml index for each folder.
- Per-folder image position saved in the browser.

## Project Structure

~~~text
FrameAudit/
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── static/
│   ├── assets/
│   └── index.html
├── .gitignore
├── README.md
├── main.py
└── requirements.txt
~~~
