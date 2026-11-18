import json
import os
import urllib.parse
import urllib.request


def send_discord_payload(payload, channel="updates"):
    """
    Sends payload to either the updates webhook or feed webhook.
    """
    raw_url = ""
    if channel == "feed":
        raw_url = os.environ.get("FEED_WEBHOOK_URL", "").strip() or os.environ.get("WEBHOOK_URL", "").strip()
    else:
        raw_url = os.environ.get("WEBHOOK_URL", "").strip()

    if not raw_url:
        print(f"Webhook URL for channel '{channel}' not set; skipping.")
        return False

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
        print(f"Delivered Discord notification to {channel} ({resp.status})")
        return True
