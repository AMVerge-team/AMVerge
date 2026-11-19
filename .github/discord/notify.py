import json
import os
import sys

# Ensure package directory is in sys.path
package_dir = os.path.dirname(os.path.abspath(__file__))
if package_dir not in sys.path:
    sys.path.insert(0, package_dir)

from config import resolve_channel
from core import send_discord_payload
from handlers import (
    handle_push,
    handle_pull_request,
    handle_pull_request_review,
    handle_issues,
    handle_issue_comment,
    handle_release,
    handle_star,
    handle_create,
    handle_delete,
)


def dispatch_event(event_name, event):
    if event_name == "push":
        return handle_push(event)
    elif event_name == "pull_request":
        return handle_pull_request(event)
    elif event_name == "pull_request_review":
        return handle_pull_request_review(event)
    elif event_name == "issues":
        return handle_issues(event)
    elif event_name == "issue_comment":
        return handle_issue_comment(event)
    elif event_name == "release":
        return handle_release(event)
    elif event_name in ("star", "watch"):
        return handle_star(event)
    elif event_name == "create":
        return handle_create(event)
    elif event_name == "delete":
        return handle_delete(event)
    return None


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    if not event_path or not os.path.exists(event_path):
        return

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    payload = dispatch_event(event_name, event)
    if not payload:
        return

    target_channel = resolve_channel(event_name, event)
    send_discord_payload(payload, channel=target_channel)


if __name__ == "__main__":
    main()
