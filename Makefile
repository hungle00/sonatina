.PHONY: dev

dev:
	./.venv/bin/python -m uvicorn server:app --app-dir src --host 127.0.0.1 --port 8765 --reload
