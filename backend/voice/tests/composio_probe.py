"""Check of the Composio tool slugs, arguments and session setup calendars.py and the app use, against the REAL API.

    COMPOSIO_API_KEY=ck_... .venv/bin/python tests/composio_probe.py      # or with the key in .env

1. GET /toolkits/{slug} and GET /tools/{slug} (the tool's schema): fails loudly if a slug is gone or
   deprecated, or an argument we send is not in its input schema.
2. One throwaway session per toolkit, exactly as calendars.session_config() makes them (direct tools
   preset, our slug list) but with no account pinned, for the made-up user `aixel-composio-probe`:
   POST /tool_router/session (Composio refuses a session naming an invalid slug), GET it, one execute
   (it must fail for want of a connected account, NOT with 401/403: that would mean the key lacks the
   "Session tool execution" permission), then DELETE it. No real user, account or calendar is touched.
"""
import asyncio, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import product  # noqa: E402  (loads .env the way the engine does)
import aiohttp  # noqa: E402
import calendars  # noqa: E402

BASE = (product.setting("COMPOSIO_API_BASE") or "https://backend.composio.dev/api/v3.1").rstrip("/")
KEY = product.setting("COMPOSIO_API_KEY")

PROBE_USER = "aixel-composio-probe"

# slug -> the arguments we send (engine: calendars.py; app: server/voice-agent/composio.ts)
USED = {
    "GOOGLECALENDAR_FREE_BUSY_QUERY": ["items", "timeMin", "timeMax", "timeZone"],
    "GOOGLECALENDAR_CREATE_EVENT": ["calendar_id", "summary", "description", "start_datetime", "end_datetime", "timezone",
                                    "create_meeting_room", "send_updates", "attendees"],
    "GOOGLECALENDAR_DELETE_EVENT": ["event_id", "calendar_id", "send_updates"],
    "GOOGLECALENDAR_LIST_CALENDARS": ["min_access_role"],
    "OUTLOOK_GET_CALENDAR_VIEW": ["start_datetime", "end_datetime", "timezone", "top", "select", "calendar_id"],
    "OUTLOOK_CALENDAR_CREATE_EVENT": ["subject", "body", "start_datetime", "end_datetime", "time_zone", "show_as",
                                      "is_online_meeting", "online_meeting_provider", "calendar_id", "attendees_info"],
    "OUTLOOK_CANCEL_EVENT": ["user_id", "event_id", "Comment"],
    "OUTLOOK_DELETE_CALENDAR_EVENT": ["user_id", "event_id"],
    "OUTLOOK_LIST_CALENDARS": ["user_id"],
    "CAL_GET_AVAILABLE_SLOTS_INFO": ["eventTypeId", "startTime", "endTime", "timeZone", "slotFormat"],
    "CAL_POST_NEW_BOOKING_REQUEST": ["eventTypeId", "start", "timeZone", "language", "responses", "metadata"],
    "CAL_CANCEL_BOOKING_VIA_UID": ["bookingUid", "cancellationReason"],
    "CAL_LIST_EVENT_TYPES": [],
    "CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES": ["event_type", "start_time", "end_time"],
    "CALENDLY_POST_INVITEE": ["event_type", "start_time", "invitee"],
    "CALENDLY_CANCEL_SCHEDULED_EVENT": ["event_uuid", "reason"],
    "CALENDLY_GET_USER": ["uuid"],
    "CALENDLY_LIST_EVENT_TYPES": ["user", "active", "count"],
}
TOOLKITS = ["googlecalendar", "outlook", "cal", "calendly"]


async def main():
    if not KEY:
        sys.exit("COMPOSIO_API_KEY is not set")
    bad = 0
    async with aiohttp.ClientSession(headers={"x-api-key": KEY}, timeout=aiohttp.ClientTimeout(total=20)) as s:
        for tk in TOOLKITS:
            async with s.get(f"{BASE}/toolkits/{tk}") as r:
                body = await r.json(content_type=None)
            managed = body.get("composio_managed_auth_schemes") or body.get("auth_config_details") or "?"
            print(f"toolkit {tk}: HTTP {r.status}, managed auth: {str(managed)[:120]}")
        for slug, args in USED.items():
            t0 = time.monotonic()
            async with s.get(f"{BASE}/tools/{slug}") as r:
                body = await r.json(content_type=None)
            ms = round((time.monotonic() - t0) * 1000)
            if r.status != 200:
                print(f"FAIL {slug}: HTTP {r.status} {str(body)[:200]}"); bad += 1; continue
            props = (body.get("input_parameters") or {}).get("properties") or {}
            missing = [a for a in args if a not in props]
            dep = body.get("is_deprecated")
            status = "FAIL" if missing or dep else "ok  "
            bad += bool(missing or dep)
            print(f"{status} {slug} v{body.get('version')} ({ms} ms){' DEPRECATED' if dep else ''}"
                  f"{' missing: ' + ', '.join(missing) if missing else ''}; required: {(body.get('input_parameters') or {}).get('required')}")
            if slug == "CALENDLY_POST_INVITEE":
                print("     invitee schema:", str(props.get("invitee"))[:400])
        missing = sorted(set(USED) - {t for ts in calendars.TOOLS.values() for t in ts})
        if missing:
            print(f"FAIL slugs used but not in calendars.TOOLS (their sessions would refuse them): {missing}"); bad += 1
        print(f"\n{len(USED) - bad}/{len(USED)} slugs as used")

        print("\nsessions (direct tools preset), throwaway, no account:")
        for tk in TOOLKITS:
            body = calendars.session_config(PROBE_USER, tk, None)
            t0 = time.monotonic()
            async with s.post(f"{BASE}/tool_router/session", json=body) as r:
                made = await r.json(content_type=None)
            ms = round((time.monotonic() - t0) * 1000)
            sid = made.get("session_id") if isinstance(made, dict) else None
            if r.status not in (200, 201) or not sid:
                print(f"FAIL {tk}: create HTTP {r.status} {str(made)[:300]}"); bad += 1; continue
            cfg = made.get("config") or {}
            print(f"ok   {tk}: {sid} in {ms} ms; tools {sorted(made.get('tool_router_tools') or [])}; "
                  f"search {cfg.get('search')}, manage_connections {cfg.get('manage_connections')}, "
                  f"workbench {(cfg.get('workbench') or {}).get('enable')}, multi_account {cfg.get('multi_account')}")
            if sorted(made.get("tool_router_tools") or []) != sorted(calendars.TOOLS[tk]):
                # Not counted: the docs do not say what tool_router_tools lists under the preset. Look at it.
                print(f"WARN {tk}: the session lists {made.get('tool_router_tools')}, not exactly our slugs")
            try:
                async with s.get(f"{BASE}/tool_router/session/{sid}") as r:
                    print(f"     GET session: HTTP {r.status}")
                    bad += r.status != 200
                t0 = time.monotonic()
                async with s.post(f"{BASE}/tool_router/session/{sid}/execute",
                                  json={"tool_slug": calendars.TOOLS[tk][-1], "arguments": {}}) as r:
                    ex = await r.json(content_type=None)
                ms = round((time.monotonic() - t0) * 1000)
                kind = ex.get("result_type") if isinstance(ex, dict) else None
                denied = r.status in (401, 403)
                print(f"{'FAIL' if denied else 'ok  '} execute with no account: HTTP {r.status} result_type={kind} ({ms} ms) "
                      f"{str(ex.get('error') if isinstance(ex, dict) else ex)[:200]}")
                bad += denied
            finally:
                async with s.delete(f"{BASE}/tool_router/session/{sid}") as r:
                    print(f"     DELETE session: HTTP {r.status}")
    print("\nall good" if not bad else f"\n{bad} problem(s)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
