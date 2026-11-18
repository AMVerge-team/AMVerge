from ..config import COLOR_GREEN, COLOR_BLUE, COLOR_RED
from ..core import make_buttons
from ..formatting import clean_codeblock, format_card_header


def handle_pull_request_review(event):
    action = event.get("action", "")
    review = event.get("review") or {}
    pr = event.get("pull_request") or {}
    if not review or not pr or action != "submitted":
        return None

    repo_name = event["repository"]["name"]
    repo_full = event["repository"]["full_name"]
    repo_url = event["repository"]["html_url"]
    pr_num = pr.get("number")
    pr_title = pr.get("title", "")
    review_url = review.get("html_url") or pr.get("html_url") or repo_url

    sender = event.get("sender") or {}
    sender_name = sender.get("login", "github")
    sender_avatar = sender.get("avatar_url") or "https://github.com/AMVerge-team.png"
    sender_url = sender.get("html_url") or repo_url

    state = (review.get("state") or "").lower()
    if state == "approved":
        state_label = "Approved"
        action_verb = "approved changes on pull request"
        color = COLOR_GREEN
    elif state == "changes_requested":
        state_label = "Changes Requested"
        action_verb = "requested changes on pull request"
        color = COLOR_RED
    else:
        state_label = "Reviewed"
        action_verb = "submitted a review on pull request"
        color = COLOR_BLUE

    review_body = clean_codeblock(review.get("body"), max_len=300)
    action_line = f"{sender_name} {action_verb} in {repo_full}"
    header = format_card_header(repo_name, repo_url, action_line)

    desc_parts = [
        header,
        f"### [#{pr_num} {pr_title}]({review_url})",
    ]
    if review_body:
        desc_parts.append(review_body)

    desc_parts.append(f"📌 **Review State:** `{state_label}`")
    desc = "\n".join(desc_parts)

    return {
        "username": "AMVerge Desktop",
        "avatar_url": "https://github.com/AMVerge-team.png",
        "embeds": [
            {
                "author": {"name": sender_name, "url": sender_url, "icon_url": sender_avatar},
                "description": desc[:4096],
                "color": color,
                "footer": {"text": f"{repo_full} • PR #{pr_num} Review", "icon_url": "https://github.com/AMVerge-team.png"},
            }
        ],
        "components": make_buttons([("View Review", review_url), ("Open Repository", repo_url)]),
    }
