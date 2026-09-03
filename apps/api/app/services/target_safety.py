"""Target safety checks — SSRF / DNS-rebinding hardening for scope validation.

This module answers one question: is this target *intrinsically unsafe* to
touch, regardless of what the engagement's scope rules say? It is a
deny-list layered on top of (never instead of) the default-deny scope
validator in `scope_validator.py`, and it runs at both checkpoints:

  - scope-rule creation (`routers/scope.py` rejects dangerous include patterns)
  - execution-time validation (`ScopeValidator.validate_target`)

What is denied:

  1. IP literals in loopback, link-local (incl. cloud metadata
     `169.254.169.254`), unspecified, multicast, or reserved ranges.
  2. Hostnames that are `localhost`, `*.localhost`, or well-known cloud
     metadata endpoints (AWS / GCP / Azure).
  3. Hostnames whose DNS resolution returns an address in one of the
     denied ranges above (rebinding-style protection, best-effort:
     resolution is time-of-check only; deployment egress controls remain
     the backstop — see `docs/security.md` §1.8).

Deliberately NOT denied here: RFC 1918 / ULA private ranges. The canonical
MORPHIA demo (`demo-target`) and most self-hosted deployments live on
private networks; denying them would make the product unusable. Private
targets are still subject to the full default-deny scope check, dual
checkpoints, and human approval. Deployments that want a stricter posture
set `SCOPE_DENY_PRIVATE_RANGES=true`, which extends the literal + DNS
denials to private ranges as well.
"""

from __future__ import annotations

import ipaddress
import os
import re
import socket
from urllib.parse import urlparse

# Cloud instance-metadata endpoints that must never be reachable as a target.
METADATA_HOSTNAMES = frozenset(
    {
        "169.254.169.254",
        "metadata.google.internal",
        "metadata.google.com",
        "metadata.goog",
        "instance-data",
        "instance-data-compute",
        "metadata.azure.internal",
        "metadata.aws.internal",
    }
)

_METADATA_SUFFIXES = (".metadata.google.internal", ".metadata.azure.internal")


def _deny_private_ranges() -> bool:
    return os.getenv("SCOPE_DENY_PRIVATE_RANGES", "false").lower() in ("1", "true", "yes")


def _extract_host(target: str) -> str:
    """Return the hostname/IP from a bare host or a full URL. Never raises."""
    value = (target or "").strip()
    if not value:
        return ""
    if "://" in value:
        try:
            host = urlparse(value).hostname or ""
            return host.strip().rstrip(".")
        except ValueError:
            return ""
    # Bare `host:port` without scheme (but not an IPv6 literal).
    if value.count(":") == 1 and not value.startswith("["):
        value = value.split(":")[0]
    return value.strip().rstrip(".").lower()


def _unsafe_ip_reason(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
    if address.is_loopback:
        return f"IP literal '{address}' is loopback and may target this host."
    if address.is_link_local:
        return f"IP literal '{address}' is link-local (cloud metadata range)."
    if address.is_unspecified:
        return f"IP literal '{address}' is the unspecified address."
    if address.is_multicast:
        return f"IP literal '{address}' is multicast."
    if address.is_reserved:
        return f"IP literal '{address}' is in a reserved range."
    if _deny_private_ranges() and address.is_private:
        return f"IP literal '{address}' is in a private range (SCOPE_DENY_PRIVATE_RANGES)."
    return None


def _resolve_unsafe_reason(host: str) -> str | None:
    """Best-effort DNS check: deny if the hostname resolves to denied space.

    Resolution failure is NOT a denial here — offline test environments and
    not-yet-provisioned targets must not be treated as attacks; the
    default-deny scope match still applies. Literal-IP inputs, which need no
    DNS, are always fully checked by `_unsafe_ip_reason`.
    """
    try:
        infos = socket.getaddrinfo(host, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        return None
    seen: set[str] = set()
    for info in infos:
        ip_str = str(info[4][0])
        if ip_str in seen:
            continue
        seen.add(ip_str)
        try:
            address = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        reason = _unsafe_ip_reason(address)
        if reason is not None:
            return f"Hostname '{host}' resolves to denied address {ip_str}."
    return None


def prohibited_target_reason(target: str) -> str | None:
    """Return a denial reason if `target` is intrinsically unsafe, else None."""
    host = _extract_host(target)
    if not host:
        return "Target is empty or unparseable."

    lowered = host.lower()
    if not re.fullmatch(r"[a-z0-9.\-_~%]+", lowered):
        return f"Target '{target}' is not a valid hostname or IP literal."
    if lowered == "localhost" or lowered.endswith(".localhost"):
        return f"Target '{target}' addresses localhost."
    if lowered in METADATA_HOSTNAMES or lowered.endswith(_METADATA_SUFFIXES):
        return f"Target '{target}' is a cloud instance-metadata endpoint."

    try:
        address = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        address = None
    if address is not None:
        return _unsafe_ip_reason(address)

    return _resolve_unsafe_reason(host)


def prohibited_scope_pattern_reason(pattern: str) -> str | None:
    """Denial reason if an *include* scope pattern authorizes unsafe space.

    Handles the three pattern shapes the validator matches: glob wildcards,
    CIDR ranges, and exact hostnames. Exclude rules are never checked —
    carving unsafe space *out* is always allowed.
    """
    value = (pattern or "").strip()
    if not value:
        return "Scope pattern is empty."

    if any(ch in value for ch in ("*", "?", "[")):
        # Glob: inspect the concrete suffix (e.g. `*.localhost` -> `localhost`).
        suffix = value.lstrip("*?[").lstrip(".")
        if not suffix:
            return f"Scope pattern '{pattern}' is an unbounded wildcard."
        return prohibited_target_reason(suffix)

    if "/" in value:
        try:
            network = ipaddress.ip_network(value, strict=False)
        except ValueError:
            return None  # Not a CIDR — validated as a hostname below.
        for sample in (network.network_address, network.broadcast_address):
            reason = _unsafe_ip_reason(sample)
            if reason is not None:
                return f"Scope pattern '{pattern}' covers denied space ({sample})."
        return None

    return prohibited_target_reason(value)
