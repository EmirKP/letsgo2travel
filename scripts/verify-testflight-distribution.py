#!/usr/bin/env python3
"""Read existing TestFlight distribution state; never upload or modify Apple data."""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

APP_ID = "6798807237"
BUILD_ID = "6a6a7aad-c91c-433d-bb3a-25b9906c5204"
BUILD_NUMBER = "83"
GROUP_NAME = "LetsGo2Travel İç Test"
API = "https://api.appstoreconnect.apple.com/v1"
REPORT = Path("testflight-distribution-83.json")
MAX_PAGES = 10


class VerificationError(Exception):
    """An allowlisted reason that is safe to display in CI."""


def require(condition, reason):
    if not condition:
        raise VerificationError(reason)


def get_json(client, path_or_url, params=None):
    url = API + path_or_url if path_or_url.startswith("/") else path_or_url
    parsed = urlsplit(url)
    require(
        parsed.scheme == "https"
        and parsed.netloc == "api.appstoreconnect.apple.com"
        and parsed.path.startswith("/v1/")
        and not parsed.fragment,
        "Apple returned an unexpected pagination address.",
    )
    response = client.session.get(
        url, params=params, timeout=30, allow_redirects=False
    )
    require(response.status_code == 200, "Apple did not return a successful read response.")
    result = response.json()
    require(isinstance(result, dict), "Apple returned an unexpected response format.")
    return result


def read_pages(client, path, params):
    url, seen, records = API + path, set(), []
    expected_path = urlsplit(url).path
    for _ in range(MAX_PAGES):
        require(url not in seen, "Apple pagination repeated a page.")
        require(urlsplit(url).path == expected_path, "Apple pagination changed its resource.")
        seen.add(url)
        page = get_json(client, url, params)
        data = page.get("data")
        require(isinstance(data, list), "Apple returned an unexpected list format.")
        records.extend(data)
        url = page.get("links", {}).get("next")
        if not url:
            return records
        require(isinstance(url, str), "Apple returned an invalid next-page address.")
        params = None
    raise VerificationError("Apple pagination exceeded the verification limit.")


def verify(report):
    # The existing Codemagic integration supplies these values. Never print them.
    from codemagic.apple.app_store_connect import (
        AppStoreConnectApiClient,
        IssuerId,
        KeyIdentifier,
    )

    names = (
        "APP_STORE_CONNECT_KEY_IDENTIFIER",
        "APP_STORE_CONNECT_ISSUER_ID",
        "APP_STORE_CONNECT_PRIVATE_KEY",
    )
    require(all(os.environ.get(name) for name in names), "The existing Apple integration is unavailable.")
    logging.disable(logging.CRITICAL)
    client = AppStoreConnectApiClient(
        KeyIdentifier(os.environ[names[0]]),
        IssuerId(os.environ[names[1]]),
        os.environ[names[2]],
        log_requests=False,
        unauthorized_request_retries=0,
        server_error_retries=0,
        enable_jwt_cache=False,
    )
    build = get_json(client, "/builds/" + BUILD_ID)["data"]
    attrs = build["attributes"]
    report["build"] = {
        "id": build["id"],
        "version": attrs.get("version"),
        "processingState": attrs.get("processingState"),
        "expired": attrs.get("expired"),
    }
    require(build["id"] == BUILD_ID and attrs.get("version") == BUILD_NUMBER, "Apple build identity did not match build 83.")
    require(attrs.get("processingState") == "VALID", "Build 83 has not completed Apple processing successfully.")
    require(attrs.get("expired") is False, "Build 83 is expired or its expiry state is unavailable.")

    details = get_json(client, "/builds/" + BUILD_ID + "/buildBetaDetail")["data"]
    state = details["attributes"].get("internalBuildState")
    report["internalBuildState"] = state
    require(state == "IN_BETA_TESTING", "Build 83 is not currently in internal beta testing.")

    groups = read_pages(client, "/apps/" + APP_ID + "/betaGroups", {
        "fields[betaGroups]": "name,isInternalGroup,hasAccessToAllBuilds",
        "limit": 200,
    })
    matches = [group for group in groups if group.get("attributes", {}).get("name") == GROUP_NAME]
    require(len(matches) == 1, "The existing internal test group could not be uniquely resolved.")
    group = matches[0]
    attrs = group["attributes"]
    report["group"] = {
        "id": group["id"],
        "name": attrs.get("name"),
        "isInternalGroup": attrs.get("isInternalGroup"),
        "hasAccessToAllBuilds": attrs.get("hasAccessToAllBuilds"),
    }
    require(attrs.get("isInternalGroup") is True, "The selected test group is not an internal group.")
    require(attrs.get("hasAccessToAllBuilds") is True, "Automatic distribution is not enabled for the internal group.")

    builds = read_pages(client, "/betaGroups/" + group["id"] + "/builds", {
        "fields[builds]": "version,processingState,expired",
        "limit": 200,
    })
    membership = any(item.get("id") == BUILD_ID and item.get("attributes", {}).get("version") == BUILD_NUMBER for item in builds)
    report["buildIsInGroup"] = membership
    require(membership, "Apple has not associated build 83 with the existing internal test group.")
    report["verified"] = True


def main():
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "appId": APP_ID,
        "expectedBuildId": BUILD_ID,
        "expectedBuildNumber": BUILD_NUMBER,
        "verified": False,
    }
    try:
        verify(report)
    except VerificationError as error:
        report["failure"] = str(error)
    except Exception:
        # API exceptions may contain request or authentication details.
        report["failure"] = "Apple distribution verification could not complete; no Apple data was changed."
    try:
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError:
        print("Could not save the public TestFlight verification report.", file=sys.stderr)
        return 1
    if not report["verified"]:
        print("TestFlight verification: " + report["failure"], file=sys.stderr)
        return 1
    print("TestFlight build 83 is valid, in internal testing, and available to the automatic internal group.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
