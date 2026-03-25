"""Module execution entrypoint: ``python -m client``."""

from client.main import sync_main


if __name__ == "__main__":
    raise SystemExit(sync_main())
