from ..config import COLOR_GREEN, COLOR_RED
from ..core import make_buttons
from ..formatting import format_card_header


def handle_create(event):
    ref_type = event.get("ref_type", "")
    ref_name = event.get("ref", "")
    if ref_type not in ("branch", "tag") or not ref_name:
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    ref_url = f"{repo_url}/tree/{ref_name}"

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    action_line = f"{sender_name} created {ref_type} in {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)
    icon = "🌿" if ref_type == "branch" else "🏷️"

    desc = (
        f"{header}\n"
        f"{icon} **{ref_type.capitalize()}:** [`{ref_name}`]({ref_url})"
    )

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc,
                "color": COLOR_GREEN,
                "footer": {"text": f"{repo_full} • Created {ref_type}", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([(f"View {ref_type.capitalize()}", ref_url), ("Open Repository", repo_url)]),
    }


def handle_delete(event):
    ref_type = event.get("ref_type", "")
    ref_name = event.get("ref", "")
    if ref_type not in ("branch", "tag") or not ref_name:
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    action_line = f"{sender_name} deleted {ref_type} in {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc = (
        f"{header}\n"
        f"🗑️ **Deleted {ref_type.capitalize()}:** `{ref_name}`"
    )

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc,
                "color": COLOR_RED,
                "footer": {"text": f"{repo_full} • Deleted {ref_type}", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([("Open Repository", repo_url)]),
    }
