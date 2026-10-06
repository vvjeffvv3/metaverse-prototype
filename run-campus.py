"""Start the shared local campus and display addresses for classmates."""
import os
from pathlib import Path
import sys

from config.network import local_lan_addresses


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    os.chdir(root)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    if os.environ.get("RUN_MAIN") != "true":
        print("This PC: http://127.0.0.1:8002/", flush=True)
        for address in local_lan_addresses():
            print(f"Same network: http://{address}:8002/", flush=True)
        print("Keep this window open. Press Ctrl+C to stop.", flush=True)
    from django.core.management import execute_from_command_line
    # Only the serving child owns the updater; the autoreload parent never does.
    if os.environ.get("RUN_MAIN") == "true" or "--noreload" in sys.argv[1:]:
        from campus.menu_updater import start_menu_updater
        start_menu_updater()
    execute_from_command_line([str(root / "manage.py"), "runserver", "0.0.0.0:8002", *sys.argv[1:]])
