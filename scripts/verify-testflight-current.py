#!/usr/bin/env python3
"""Verify a new, already uploaded iOS TestFlight build using read operations only."""

import importlib.util
import json
import logging
import os
import re
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Reuse the already tested, origin-bound Apple GET/pagination/error helpers.
# Importing the legacy module never calls its main or writes its build-83 report.
_spec = importlib.util.spec_from_file_location(
    "_testflight_read_helpers", Path(__file__).with_name("verify-testflight-distribution.py")
)
_reads = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_reads)
VerificationError = _reads.VerificationError
require = _reads.require
read_pages = _reads.read_pages
get_json = _reads.get_json

APP_ID = "6798807237"
GROUP_ID = "1f956c5b-779d-41e6-8e9a-73f80b5a20f3"
MINIMUM_EXCLUSIVE_BUILD = 83
REPORT = Path("testflight-current.json")
REEXEC_FLAG = "LETSGO_TF_CURRENT_VERIFIER_REEXEC"


def import_sdk(report):
    report["stage"] = "import_sdk"
    try:
        from codemagic.apple.app_store_connect import AppStoreConnectApiClient
        from codemagic.tools.app_store_connect.arguments import Types
        return AppStoreConnectApiClient, Types
    except ImportError:
        # Same entrypoint-Python allowlist as the legacy check. Reexecute THIS
        # script at most once; never install tools or run a caller-supplied path.
        if os.environ.get(REEXEC_FLAG) != "1":
            entrypoint = shutil.which("app-store-connect")
            if entrypoint:
                with open(entrypoint, encoding="utf-8") as script:
                    shebang = script.readline(512).strip()
                if shebang.startswith("#!"):
                    parts = shlex.split(shebang[2:])
                    interpreter = None
                    if parts and Path(parts[0]).name == "env":
                        names = [part for part in parts[1:] if not part.startswith("-")]
                        if names:
                            interpreter = shutil.which(names[0])
                    elif len(parts) == 1:
                        interpreter = parts[0]
                    if (interpreter and re.fullmatch(r"python(?:\d+(?:\.\d+)*)?", Path(interpreter).name)
                            and Path(interpreter).is_file()
                            and Path(interpreter).absolute() != Path(sys.executable).absolute()):
                        os.environ[REEXEC_FLAG] = "1"
                        os.execv(interpreter, [interpreter, str(Path(__file__).resolve())])
        raise


def cli_read(arguments):
    result = subprocess.run(
        ["app-store-connect", *arguments, "--log-stream", "stderr", "--no-color"],
        capture_output=True, text=True, timeout=90, check=False,
    )
    require(result.returncode == 0, "The existing Apple CLI could not complete the requested read.")
    return result.stdout.strip()


def build_number(value):
    require(isinstance(value, str) and re.fullmatch(r"[1-9][0-9]{0,8}", value), "Apple returned an invalid integer build number.")
    require(int(value) > MINIMUM_EXCLUSIVE_BUILD, "The selected build must be newer than build 83.")
    return value


def resource(payload, reason):
    require(isinstance(payload, dict) and isinstance(payload.get("data"), dict), reason)
    return payload["data"]


def verify(report):
    logging.disable(logging.CRITICAL)
    expected = os.environ.get("LETSGO_EXPECTED_TESTFLIGHT_BUILD_NUM")
    if expected is not None:
        expected = build_number(expected)
        report["expectedBuildNumber"] = expected

    AppStoreConnectApiClient, Types = import_sdk(report)
    report["stage"] = "normalize_credentials"
    normalized = [argument.from_environment_variable_default() for argument in (
        Types.KeyIdentifierArgument, Types.IssuerIdArgument, Types.PrivateKeyArgument,
    )]
    require(all(value is not None for value in normalized), "The existing Apple integration is unavailable.")
    report["stage"] = "create_client"
    client = AppStoreConnectApiClient(
        normalized[0].value, normalized[1].value, normalized[2].value,
        log_requests=False, unauthorized_request_retries=0,
        server_error_retries=0, enable_jwt_cache=False,
    )

    report["stage"] = "read_latest_build_number"
    latest = build_number(cli_read(["get-latest-testflight-build-number", APP_ID, "--platform", "IOS"]))
    report["latestBuildNumber"] = latest
    require(expected is None or latest == expected, "The latest Apple build does not match the explicitly expected build number.")

    report["stage"] = "resolve_build_id"
    builds = read_pages(client, "/builds", {
        "filter[app]": APP_ID, "filter[version]": latest,
        "fields[builds]": "version,processingState,expired", "limit": 200,
    })
    matches = [item for item in builds if isinstance(item, dict) and item.get("type") == "builds"
               and item.get("attributes", {}).get("version") == latest]
    require(len(matches) == 1, "The new Apple build could not be uniquely resolved for this app.")
    build = matches[0]
    build_id, attrs = build.get("id"), build["attributes"]
    require(isinstance(build_id, str) and re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", build_id), "Apple returned an invalid build identity.")
    report["build"] = {"id": build_id, "version": attrs.get("version"),
                       "processingState": attrs.get("processingState"), "expired": attrs.get("expired")}
    require(attrs.get("processingState") == "VALID", "The new build has not completed Apple processing successfully.")
    require(attrs.get("expired") is False, "The new build is expired or its expiry state is unavailable.")

    report["stage"] = "verify_app_and_platform"
    app = resource(get_json(client, "/builds/" + build_id + "/app"), "Apple did not return the build's app.")
    require(app.get("id") == APP_ID, "The resolved build belongs to another app.")
    prerelease = resource(get_json(client, "/builds/" + build_id + "/preReleaseVersion"), "Apple did not return the build's platform.")
    require(prerelease.get("attributes", {}).get("platform") == "IOS", "The resolved build is not an iOS build.")
    report["platform"] = "IOS"

    report["stage"] = "read_internal_state"
    payload = json.loads(cli_read(["builds", "beta-details", build_id, "--json"]))
    details = payload.get("data", payload) if isinstance(payload, dict) else None
    require(isinstance(details, dict), "The Apple CLI returned invalid beta details.")
    require(details.get("id") == build_id and details.get("type") == "buildBetaDetails", "Apple beta details did not match the new build identity.")
    state = details.get("attributes", {}).get("internalBuildState")
    report["internalBuildState"] = state
    require(state == "IN_BETA_TESTING", "The new build is not currently in internal beta testing.")

    report["stage"] = "read_existing_group"
    groups = read_pages(client, "/apps/" + APP_ID + "/betaGroups", {
        "fields[betaGroups]": "name,isInternalGroup,hasAccessToAllBuilds", "limit": 200,
    })
    matches = [group for group in groups if isinstance(group, dict) and group.get("id") == GROUP_ID]
    require(len(matches) == 1, "The exact existing internal group could not be resolved for this app.")
    attrs = matches[0].get("attributes", {})
    report["group"] = {"id": GROUP_ID, "isInternalGroup": attrs.get("isInternalGroup"),
                       "hasAccessToAllBuilds": attrs.get("hasAccessToAllBuilds")}
    require(attrs.get("isInternalGroup") is True, "The existing group is not an internal group.")
    require(attrs.get("hasAccessToAllBuilds") is True, "Automatic distribution is not enabled for the existing group.")

    report["stage"] = "read_group_build_membership"
    members = read_pages(client, "/betaGroups/" + GROUP_ID + "/builds", {
        "fields[builds]": "version,processingState,expired", "limit": 200,
    })
    membership = any(item.get("id") == build_id and item.get("attributes", {}).get("version") == latest
                     and item.get("attributes", {}).get("processingState") == "VALID"
                     and item.get("attributes", {}).get("expired") is False for item in members if isinstance(item, dict))
    report["buildIsInGroup"] = membership
    require(membership, "Apple has not associated the new build with the exact existing internal group.")
    report["verified"] = True
    report["stage"] = "complete"


def main():
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "appId": APP_ID,
              "minimumExclusiveBuildNumber": MINIMUM_EXCLUSIVE_BUILD,
              "verified": False, "stage": "start"}
    try:
        verify(report)
    except VerificationError as error:
        report["failure"] = str(error)
    except Exception as error:
        report["failure"] = "Current TestFlight verification could not complete; no Apple data was changed."
        name = type(error).__name__
        report["exceptionType"] = name if name in _reads.SAFE_EXCEPTION_TYPES else "UnexpectedError"
    try:
        # A fixed distinct path: no user-provided path and no overwrite of the
        # legacy build-83 artifact. Refuse symlinks rather than following them.
        require(not REPORT.is_symlink(), "The report path must not be a symlink.")
        with REPORT.open("x", encoding="utf-8") as output:
            output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    except (OSError, VerificationError):
        print("Could not create the current TestFlight verification report safely.", file=sys.stderr)
        return 1
    if not report["verified"]:
        print("TestFlight verification [" + report["stage"] + "]: " + report["failure"], file=sys.stderr)
        return 1
    print("TestFlight build " + report["latestBuildNumber"] + " is valid and available to the existing automatic internal group.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
