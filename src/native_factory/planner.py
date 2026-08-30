from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from .models import App, ConfigError


def planning_prompt(app: App, goals: str = "") -> str:
    capabilities = ", ".join(app.native.capabilities) or "none selected yet"
    return f"""You are the product, mobile release, QA and store-submission planner for this app.

App: {app.native.display_name}
Suite: {app.suite}
Role: {app.app_role}
Permanent ID: {app.native.ios_bundle_id}
Source: {app.source.repo} at {app.source.ref}
Current native capabilities: {capabilities}
Business goals and context:
{goals.strip() or 'Ask the operator for goals, users, monetisation, regulated features and launch market.'}

Create a practical Markdown plan with these exact sections:
1. Product scope and explicit non-goals
2. Users, role permissions and critical journeys
3. Lovable implementation backlog with acceptance criteria
4. Capacitor/native capability map and permission reasons
5. Supabase tables, RLS policies, storage, auth and server-side functions
6. Security and privacy data-flow inventory, including third-party SDKs
7. Apple App Privacy and Google Data Safety questions requiring human confirmation
8. Store positioning, title options, short/full description draft, keywords and screenshot storyboard
9. Real-device test matrix and reviewer-account setup
10. Git/Lovable update, TestFlight, Play Internal Testing and production rollout plan
11. Risks, unanswered questions and an approval checklist

Rules: do not invent legal claims, credentials, data practices or completed tests. Mark unknowns as HUMAN CONFIRMATION. Keep Customer, Driver, Kitchen and other role apps distinct when relevant. Production release must remain human-approved.
"""


def _response_text(payload: dict) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    parts: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                parts.append(str(content["text"]))
    if not parts:
        raise ConfigError("OpenAI response did not contain planning text")
    return "\n".join(parts)


def create_ai_plan(prompt: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "").strip()
    if not api_key or not model:
        raise ConfigError(
            "Set OPENAI_API_KEY and OPENAI_MODEL on the Python server, or export the prompt to ChatGPT"
        )
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps({"model": model, "input": prompt}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ConfigError(f"OpenAI planning request failed ({exc.code}): {detail[:500]}") from exc
    except urllib.error.URLError as exc:
        raise ConfigError(f"Could not reach OpenAI: {exc.reason}") from exc
    return _response_text(result)


def write_plan_pack(
    factory_root: Path, app: App, *, goals: str = "", call_ai: bool = False
) -> tuple[Path, Path | None, str]:
    directory = factory_root / "plans" / app.slug
    directory.mkdir(parents=True, exist_ok=True)
    prompt = planning_prompt(app, goals)
    prompt_path = directory / "CHATGPT_PLANNING_PROMPT.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    if not call_ai:
        return prompt_path, None, prompt
    plan = create_ai_plan(prompt)
    plan_path = directory / "APP_PLAN.md"
    plan_path.write_text(plan.strip() + "\n", encoding="utf-8")
    return prompt_path, plan_path, plan
