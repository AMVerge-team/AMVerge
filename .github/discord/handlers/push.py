from ..config import COLOR_GREEN
from ..core import make_buttons
from ..formatting import format_card_header


def handle_push(event):
    commits = event.get("commits") or []
    if not commits:
        return None

    branch = event["ref"].removeprefix("refs/heads/")
    if branch.startswith("l10n_"):
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    compare_url = event.get("compare") or repo_url

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    count = len(commits)
    commit_word = "commit" if count == 1 else "commits"

    lines = []
    for c in commits[:8]:
        sha = c["id"][:7]
        url = c["url"]
        msg = (c.get("message") or "").splitlines()[0]
        author = (c.get("author") or {}).get("username") or (c.get("author") or {}).get("name") or sender_name
        lines.append(f"[`{sha}`]({url}) {msg} - *{author}*")

    if count > 8:
        lines.append(f"*...and {count - 8} more commit(s) on GitHub*")

    action_line = f"{sender_name} pushed to {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc = (
        f"{header}\n"
        f"## [{count} new {commit_word}]({compare_url}) to [{branch}]({repo_url}/tree/{branch})\n"
        + "\n".join(lines)
    )

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc[:4096],
                "color": COLOR_GREEN,
                "footer": {"text": f"{repo_full} • {branch}", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([("Compare on GitHub", compare_url), ("Open Repository", repo_url)]),
    }
