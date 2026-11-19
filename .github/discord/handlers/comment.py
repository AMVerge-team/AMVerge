from config import COLOR_BLUE
from core import make_buttons
from formatting import clean_codeblock, format_card_header


def handle_issue_comment(event):
    action = event.get("action", "")
    comment = event.get("comment") or {}
    issue = event.get("issue") or {}
    if not comment or not issue or action != "created":
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    item_num = issue.get("number")
    item_title = issue.get("title", "")
    comment_url = comment.get("html_url") or issue.get("html_url") or repo_url
    is_pr = "pull_request" in issue
    kind_str = "pull request" if is_pr else "issue"

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    comment_body = clean_codeblock(comment.get("body"), max_len=300)
    action_line = f"{sender_name} commented on {kind_str} in {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc_parts = [
        header,
        f"### [#{item_num} {item_title}]({comment_url})",
    ]
    if comment_body:
        desc_parts.append(comment_body)

    desc = "\n".join(desc_parts)

    btn_label = "View PR Comment" if is_pr else "View Issue Comment"
    footer_text = f"{repo_full} • {'PR' if is_pr else 'Issue'} #{item_num} Comment"

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc[:4096],
                "color": COLOR_BLUE,
                "footer": {"text": footer_text, "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([(btn_label, comment_url), ("Open Repository", repo_url)]),
    }
