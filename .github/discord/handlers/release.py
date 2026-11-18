from ..config import COLOR_GOLD
from ..core import make_buttons
from ..formatting import clean_codeblock, format_card_header


def handle_release(event):
    action = event.get("action", "")
    rel = event.get("release") or {}
    if action != "published" or not rel:
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    tag_name = rel.get("tag_name", "")
    rel_name = rel.get("name") or tag_name
    rel_url = rel.get("html_url") or repo_url

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    body_codeblock = clean_codeblock(rel.get("body"), max_len=300)
    action_line = f"{sender_name} published a release in {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc_parts = [
        header,
        f"🚀 **[{rel_name}]({rel_url})** is now live!\n🏷️ **Tag:** `{tag_name}`",
    ]
    if body_codeblock:
        desc_parts.append(body_codeblock)

    desc = "\n".join(desc_parts)

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc[:4096],
                "color": COLOR_GOLD,
                "footer": {"text": f"{repo_full} • Release {tag_name}", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([("Download Release", rel_url), ("Open Repository", repo_url)]),
    }
