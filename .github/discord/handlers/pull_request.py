from ..config import COLOR_GREEN, COLOR_PURPLE, COLOR_RED
from ..core import make_buttons
from ..formatting import clean_codeblock, format_card_header


def handle_pull_request(event):
    action = event.get("action", "")
    pr = event.get("pull_request") or {}
    if not pr:
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    pr_url = pr.get("html_url") or repo_url
    pr_num = pr.get("number")
    pr_title = pr.get("title", "")
    head_branch = pr.get("head", {}).get("ref", "")
    base_branch = pr.get("base", {}).get("ref", "")

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    merged = pr.get("merged", False)
    if action == "closed" and merged:
        action_verb = "merged pull request"
        status_label = "Merged"
        color = COLOR_PURPLE
    elif action == "closed":
        action_verb = "closed pull request"
        status_label = "Closed"
        color = COLOR_RED
    else:
        action_verb = f"{action} pull request"
        status_label = "Open"
        color = COLOR_GREEN

    # Gather stats
    changed_files = pr.get("changed_files", 0)
    additions = pr.get("additions", 0)
    deletions = pr.get("deletions", 0)
    stat_str = f"`{changed_files} files` (+{additions} / -{deletions})"

    raw_labels = pr.get("labels") or []
    label_tags = " ".join([f"`{l.get('name')}`" for l in raw_labels[:4]]) if raw_labels else "None"

    body_codeblock = clean_codeblock(pr.get("body"), max_len=320)
    action_line = f"{sender_name} {action_verb} in {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc_parts = [
        header,
        f"### [#{pr_num} {pr_title}]({pr_url})",
        f"🔀 `{base_branch}` ← `{head_branch}`",
    ]
    if body_codeblock:
        desc_parts.append(body_codeblock)

    desc_parts.append(
        f"📊 **Changes:** {stat_str}\n"
        f"🏷️ **Labels:** {label_tags}\n"
        f"📌 **Status:** `{status_label}`"
    )

    desc = "\n".join(desc_parts)

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc[:4096],
                "color": color,
                "footer": {"text": f"{repo_full} • PR #{pr_num}", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([("View Pull Request", pr_url), ("Open Repository", repo_url)]),
    }
