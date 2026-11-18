def clean_codeblock(body_text, max_len=300):
    """
    Cleans markdown body text and wraps it in a codeblock without breaking backticks.
    """
    if not body_text:
        return ""
    cleaned = body_text.strip().replace("```", "'''")
    if len(cleaned) > max_len:
        cleaned = cleaned[: max_len - 3].rstrip() + "..."
    return f"```\n{cleaned}\n```"
