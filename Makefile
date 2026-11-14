.PHONY: dev frontend-build

dev: frontend-build
	./.venv/bin/python -m uvicorn server:app --app-dir src --host 127.0.0.1 --port 8765 --reload

frontend-build:
	npm --prefix frontend run build
