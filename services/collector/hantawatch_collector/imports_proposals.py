"""Submit import proposals to the web admin API (P2.c)."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _admin_base_url() -> str | None:
    for key in ('HANTAWATCH_WEB_URL', 'NEXT_PUBLIC_SITE_URL', 'VERCEL_URL'):
        val = (os.environ.get(key) or '').strip().rstrip('/')
        if not val:
            continue
        if key == 'VERCEL_URL' and not val.startswith('http'):
            return f'https://{val}'
        return val
    return None


def submit_import_proposals(
    proposals: list[dict[str, Any]],
    *,
    meta_sources: dict[str, Any] | None = None,
) -> bool:
    """POST proposals to /api/admin/imports/propose, or stash in meta.json.

    Returns True if the HTTP path succeeded.
    """
    if not proposals:
        return True

    admin_key = (os.environ.get('ADMIN_KEY') or '').strip()
    base = _admin_base_url()

    if not admin_key or not base:
        logger.warning(
            'imports proposals: ADMIN_KEY or web URL missing — logging %d proposal(s) to meta',
            len(proposals),
        )
        if meta_sources is not None:
            meta_sources['imports_proposals'] = proposals
        return False

    url = f'{base}/api/admin/imports/propose'
    try:
        with httpx.Client(timeout=httpx.Timeout(30.0)) as client:
            r = client.post(
                url,
                json={'proposals': proposals},
                headers={'Authorization': f'Bearer {admin_key}'},
            )
        if r.status_code >= 400:
            logger.warning(
                'imports proposals: POST %s -> %s %s',
                url,
                r.status_code,
                r.text[:200],
            )
            if meta_sources is not None:
                meta_sources['imports_proposals'] = proposals
            return False
        data = r.json()
        logger.info(
            'imports proposals: inserted=%s skipped=%s autoApproved=%s',
            data.get('inserted'),
            data.get('skipped'),
            data.get('autoApproved'),
        )
        return True
    except Exception as e:
        logger.warning('imports proposals: POST failed (%s)', e)
        if meta_sources is not None:
            meta_sources['imports_proposals'] = proposals
        return False
