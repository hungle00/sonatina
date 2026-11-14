# Music Toolkit

## Run locally

Install the Python dependencies in `.venv` and the frontend dependencies in
`frontend`, then run:

```sh
make dev
```

This builds the React app and starts FastAPI at `http://127.0.0.1:8765`.

## Projects

Importing a `.musicxml` or `.xml` file creates a project and its first
revision. Projects can be reopened from the project list or by their project
URL, and the current MusicXML revision can be exported from the viewer.

Project metadata is stored in `data/projects.sqlite3`. MusicXML snapshots are
stored as separate files under `data/musicxml/`; both are local application
data and are excluded from Git.
