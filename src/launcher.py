import logging
import socket
import threading
import time
import webbrowser

import uvicorn

from api.projects import project_store
from server import app


logger = logging.getLogger(__name__)


def _open_browser_when_ready(server: uvicorn.Server, url: str) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if server.started:
            logger.info("Sonatina is available at %s", url)
            try:
                if not webbrowser.open(url, new=2):
                    logger.error("Could not open the default browser at %s", url)
            except webbrowser.Error:
                logger.exception("Could not open the default browser at %s", url)
            return
        if server.should_exit:
            return
        time.sleep(0.1)

    logger.error("The local server did not start within 30 seconds")


def main() -> None:
    log_path = project_store.data_dir / "sonatina.log"
    logging.basicConfig(
        filename=log_path,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        listener.setblocking(False)
        port = listener.getsockname()[1]
        server = uvicorn.Server(
            uvicorn.Config(
                app,
                host="127.0.0.1",
                port=port,
                log_level="info",
                log_config=None,
                access_log=False,
            )
        )
        threading.Thread(
            target=_open_browser_when_ready,
            args=(server, f"http://127.0.0.1:{port}/"),
            daemon=True,
        ).start()
        server.run(sockets=[listener])


if __name__ == "__main__":
    main()
