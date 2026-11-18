import json
import os
import sys
import urllib.parse
import urllib.request

# Semantic action colors
COLOR_GREEN = 0x22C55E   # Push, Open PR
COLOR_PURPLE = 0xA855F7  # Merged PR, Reopened
COLOR_BLUE = 0x3B82F6    # Open Issue
COLOR_GOLD = 0xEAB308    # Release
COLOR_RED = 0xEF4444     # Closed PR / Issue


def send_discord_payload(payload):
    raw_url = os.environ.get("WEBHOOK_URL", "").strip()
    if not raw_url:
        print("DISCORD_WEBHOOK_URL not set; skipping.")
        return

    url = raw_url.rstrip("/")
    if url.endswith("/github"):
        url = url[: -len("/github")]

    # Append with_components=true so Discord renders link buttons
    parsed = urllib.parse.urlparse(url)
    q = urllib.parse.parse_qs(parsed.query)
    q["with_components"] = ["true"]
    webhook_url = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(q, doseq=True)))

    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "AMVerge-GitHub-Actions",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        print(f"Delivered Discord notification ({resp.status})")


def make_buttons(buttons):
    items = []
    for label, link in buttons:
        items.append({"type": 2, "style": 5, "label": label, "url": link})
    return [{"type": 1, "components": items}] if items else []


def clean_codeblock(body_text, max_len=300):
    if not body_text:
        return ""
    cleaned = body_text.strip().replace("```", "'''")
    if len(cleaned) > max_len:
        cleaned = cleaned[: max_len - 3].rstrip() + "..."
    return f"```\n{cleaned}\n```"


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

    desc = (
        f"# [{repo_name}]({repo_url})\n"
        f"{action_line}\n"
        f"**[{count} new {commit_word}]({compare_url})** to [`{branch}`]({repo_url}/tree/{branch})\n"
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

    desc_parts = [
        f"# [{repo_name}]({repo_url})\n{action_line}",
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

    desc_parts = [
        f"# [{repo_name}]({repo_url})\n{action_line}",
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

    desc_parts = [
        f"# [{repo_name}]({repo_url})\n{action_line}",
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


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    if not event_path or not os.path.exists(event_path):
        return

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    payload = None
    if event_name == "push":
        payload = handle_push(event)
    elif event_name == "pull_request":
        payload = handle_pull_request(event)
    elif event_name == "release":
        payload = handle_release(event)
    elif event_name == "issues":
        payload = handle_issues(event)

    if payload:
        send_discord_payload(payload)


if __name__ == "__main__":
    main()
