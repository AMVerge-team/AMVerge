from config import COLOR_GOLD
from core import make_buttons
from formatting import format_card_header


def handle_star(event):
    action = event.get("action", "")
    if action not in ("created", "started"):
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    stars_count = event["repository"].get("stargazers_count", 0)

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    action_line = f"{sender_name} starred {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc = (
        f"{header}\n"
        f"⭐ **Total Stars:** `{stars_count}`"
    )

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc,
                "color": COLOR_GOLD,
                "footer": {"text": f"{repo_full} • Star", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([("Open Repository", repo_url)]),
    }
