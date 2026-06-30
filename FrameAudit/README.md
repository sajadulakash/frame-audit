# FrameAudit

## Overview

FrameAudit is a React and FastAPI tool for reviewing images after CVAT annotation. Administrators dynamically add annotators, rename them, and assign each annotator an image folder from the browser.

Annotator configuration is stored outside the repository at ~/.config/frameaudit/annotators.json by default. Set FRAMEAUDIT_CONFIG_PATH to use another configuration file.

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
# Optional: FRAMEAUDIT_CONFIG_PATH=/path/to/annotators.json
~~~

Run FrameAudit:

~~~bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
~~~

Open http://127.0.0.1:8000. Sign in as administrator to create annotators and assign absolute image-folder paths.

## Features

- Dynamic annotator creation, renaming, reassignment, and removal.
- Persistent annotator configuration outside the Git repository.
- Protected administrator management APIs.
- React interfaces for administrator and annotator workflows.
- Browser Back navigation between screens.
- Previous and next image navigation.
- Delete incorrect images into deleted/.
- Undo the most recent delete.
- Automatic images.yaml index for each assigned folder.

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
