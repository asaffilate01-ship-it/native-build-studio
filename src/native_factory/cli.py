from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import load_config
from .factory import NativeFactory
from .models import ConfigError
from .onboarding import onboard_capacitor_app
from .process import ProcessRunner
from .readiness import app_readiness, has_failures, render_checks, toolchain_doctor
from .submission import generate_store_package, write_capacitor_brief


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="native-factory")
    result.add_argument("--config", type=Path, default=Path("config/apps.yml"))
    sub = result.add_subparsers(dest="command", required=True)
    onboard = sub.add_parser("onboard", help="Add a Lovable/Capacitor app to the manifest")
    onboard.add_argument("--slug", required=True)
    onboard.add_argument("--name", required=True)
    onboard.add_argument("--repo", required=True)
    onboard.add_argument("--app-id", required=True)
    onboard.add_argument("--icon", required=True, type=Path)
    onboard.add_argument("--splash", required=True, type=Path)
    onboard.add_argument("--google-services-json", type=Path)
    onboard.add_argument("--suite", default="")
    onboard.add_argument("--app-role", default="main")
    onboard.add_argument("--replace", action="store_true")
    onboard.add_argument("--runner", choices=("mac", "github-macos"), default="github-macos")
    onboard.add_argument("--package-manager", choices=("bun", "npm", "pnpm", "yarn"), default="bun")
    onboard.add_argument("--source-ref", default="main")
    onboard.add_argument("--web-dir", default="dist")
    onboard.add_argument("--ios-package-manager", choices=("spm", "cocoapods"), default="spm")
    onboard.add_argument(
        "--capability",
        action="append",
        choices=("browser", "camera", "filesystem", "network", "preferences", "push", "share"),
        default=[],
        help="Repeat for each native capability required by this app",
    )
    sub.add_parser("validate", help="Validate every app manifest and unique bundle ID")
    hydrate = sub.add_parser(
        "hydrate", help="Generate a runtime manifest and assets from the Supabase control plane"
    )
    hydrate.add_argument("slug")
    hydrate.add_argument("--output", type=Path, default=Path("config/apps.runtime.yml"))
    metadata = sub.add_parser("metadata", help="Print machine-readable app metadata")
    metadata.add_argument("slug")
    plan = sub.add_parser("plan", help="Print commands without changing files or building")
    build = sub.add_parser("build", help="Build one app")
    web_check = sub.add_parser("web-check", help="Build and validate only the Lovable web bundle")
    web_check.add_argument("slug")
    readiness = sub.add_parser(
        "readiness", help="Check assets, credentials and store prerequisites"
    )
    readiness.add_argument("slug")
    readiness.add_argument("--platform", choices=("ios", "android", "all"), default="all")
    readiness.add_argument("--submit", action="store_true")
    readiness.add_argument("--strict-secrets", action="store_true")
    doctor = sub.add_parser("doctor", help="Check tools required by the selected runner")
    doctor.add_argument("slug")
    doctor.add_argument("--platform", choices=("ios", "android", "all"), default="all")
    studio = sub.add_parser("studio", help="Open the guided local Native Factory Studio")
    studio.add_argument("--host", default="127.0.0.1")
    studio.add_argument("--port", type=int, default=8787)
    for command in (plan, build):
        command.add_argument("slug")
        command.add_argument("--platform", choices=("ios", "android", "all"), default="all")
    build.add_argument("--submit", action="store_true", help="Upload after a successful build")
    build.add_argument(
        "--metadata", action="store_true", help="Upload saved store metadata and screenshots"
    )
    brief = sub.add_parser("brief", help="Generate a Lovable/ChatGPT Capacitor-ready brief")
    brief.add_argument("slug")
    store_package = sub.add_parser("store-package", help="Generate store submission files")
    store_package.add_argument("slug")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "onboard":
            onboard_capacitor_app(
                args.config,
                slug=args.slug,
                display_name=args.name,
                repo=args.repo,
                app_id=args.app_id,
                icon=args.icon,
                splash=args.splash,
                runner=args.runner,
                package_manager=args.package_manager,
                source_ref=args.source_ref,
                web_dir=args.web_dir,
                ios_package_manager=args.ios_package_manager,
                capabilities=tuple(args.capability),
                google_services_json=args.google_services_json,
                suite=args.suite,
                app_role=args.app_role,
                replace=args.replace,
            )
            print(f"Added {args.slug} to {args.config}")
            print(f"Next: native-factory --config {args.config} readiness {args.slug}")
            return 0
        if args.command == "studio":
            from .studio import run_studio

            run_studio(args.config, host=args.host, port=args.port)
            return 0
        if args.command == "hydrate":
            from .control_plane import SupabaseControlPlane

            client = SupabaseControlPlane.from_environment(required=True)
            assert client is not None
            path = client.hydrate_app_manifest(args.slug, args.output)
            print(path)
            return 0
        config = load_config(args.config)
        if args.command == "validate":
            print(f"Valid: {len(config.apps)} apps; bundle and package IDs are unique")
            return 0
        if args.command == "metadata":
            app = config.get_app(args.slug)
            print(json.dumps({
                "slug": app.slug,
                "engine": app.native.engine,
                "runner": app.native.runner,
                "display_name": app.native.display_name,
                "version": app.native.version,
                "ios_bundle_id": app.native.ios_bundle_id,
                "android_package": app.native.android_package,
                "android_rollout": app.store.android_production_rollout,
                "review_first_name": app.store.review_contact_first_name,
                "review_last_name": app.store.review_contact_last_name,
                "review_phone": app.store.contact_phone,
                "review_email": app.store.contact_email,
                "review_notes": app.store.review_notes,
            }))
            return 0
        if args.command == "readiness":
            checks = app_readiness(
                config.get_app(args.slug),
                platform=args.platform,
                submit=args.submit,
                strict_secrets=args.strict_secrets,
            )
            print(render_checks(checks))
            return 2 if has_failures(checks) else 0
        if args.command == "doctor":
            checks = toolchain_doctor(config.get_app(args.slug), args.platform)
            print(render_checks(checks))
            return 2 if has_failures(checks) else 0
        if args.command == "brief":
            path = write_capacitor_brief(args.config.parent.parent, config.get_app(args.slug))
            print(path)
            return 0
        if args.command == "store-package":
            path = generate_store_package(args.config.parent.parent, config.get_app(args.slug))
            print(path)
            return 0
        process = ProcessRunner(dry_run=args.command == "plan")
        installed_templates = Path(__file__).resolve().parent / "templates"
        source_templates = Path(__file__).resolve().parents[2] / "templates"
        template_root = installed_templates if installed_templates.is_dir() else source_templates
        factory = NativeFactory(config, template_root, process)
        if args.command == "web-check":
            web_dir = factory.check_web(args.slug)
            print(f"Web bundle ready: {web_dir}")
            return 0
        commands = factory.build(
            args.slug,
            args.platform,
            submit=getattr(args, "submit", False),
            upload_metadata=getattr(args, "metadata", False),
        )
        if args.command == "plan":
            print("\n".join(commands))
        return 0
    except (ConfigError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
