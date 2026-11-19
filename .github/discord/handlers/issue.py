from config import COLOR_BLUE, COLOR_PURPLE, COLOR_RED
from core import make_buttons
from formatting import clean_codeblock, format_card_header


def handle_issues(event):
    action = event.get("action", "")
    issue = event.get("issue") or {}
    if not issue or action not in ("opened", "closed", "reopened"):
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    issue_num = issue.get("number")
    issue_title = issue.get("title", "")
    issue_url = issue.get("html_url") or repo_url

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    if action == "opened":
        color = COLOR_BLUE
        status_label = "Opened"
    elif action == "reopened":
        color = COLOR_PURPLE
        status_label = "Reopened"
    else:
        color = COLOR_RED
        status_label = "Closed"

    raw_labels = issue.get("labels") or []
    label_tags = " ".join([f"`{l.get('name')}`" for l in raw_labels[:4]]) if raw_labels else "None"

    body_codeblock = clean_codeblock(issue.get("body"), max_len=300)
    action_line = f"{sender_name} {action} issue in {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc_parts = [
        header,
        f"### [#{issue_num} {issue_title}]({issue_url})",
    ]
    if body_codeblock:
        desc_parts.append(body_codeblock)

    desc_parts.append(f"🏷️ **Labels:** {label_tags}\n📌 **Status:** `{status_label}`")

    desc = "\n".join(desc_parts)

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc[:4096],
                "color": color,
                "footer": {"text": f"{repo_full} • Issue #{issue_num}", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([("View Issue", issue_url), ("Open Repository", repo_url)]),
    }
