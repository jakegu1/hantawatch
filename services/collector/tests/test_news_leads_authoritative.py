"""Unit tests for the authoritative-source allowlist in news_leads.

Pins down editorial policy from 2026-05-13: only Xinhua and official
health bodies should pass the filter; everything else (chinanews.com.cn,
thepaper.cn, 天津日报, Reuters, BBC, NPR, …) is dropped.

If you change the allowlist (e.g. add 人民日报 or remove Xinhua), update
this file AND the mirror in `apps/web/src/lib/news-allowlist.ts`.
"""

from __future__ import annotations

import pytest

from hantawatch_collector.news_leads import _is_authoritative_news_source


# ============================================================================
# ALLOWED — these should pass the filter
# ============================================================================
@pytest.mark.parametrize(
    ("outlet", "link"),
    [
        # ---- Xinhua (mainland authoritative state media) ----
        ("Xinhua", "https://www.news.cn/world/abc.htm"),
        ("Xinhua News Agency", "https://english.news.cn/abc.htm"),
        ("新华网", "https://www.xinhuanet.com/world/abc.htm"),
        ("新华社", "https://www.xinhuanet.com/abc.htm"),
        # Even with a non-authoritative-looking host, outlet name wins
        ("Xinhua via Google", "https://random.example.com/article"),

        # ---- Mainland government / CDC ----
        ("国家卫生健康委", "https://www.nhc.gov.cn/yjb/abc.shtml"),
        ("中国疾病预防控制中心", "https://www.chinacdc.cn/abc.html"),
        ("", "https://www.nhc.gov.cn/yjb/abc.shtml"),         # host alone is enough
        ("", "https://wjw.gd.gov.cn/abc"),                    # provincial subdomain of gov.cn
        ("", "https://www.chinacdc.cn/abc"),

        # ---- Foreign official health bodies ----
        ("World Health Organization", "https://www.who.int/news/item/abc"),
        ("", "https://www.who.int/news/abc"),                 # host alone
        ("ECDC", "https://www.ecdc.europa.eu/threats/abc"),
        ("European Centre for Disease Prevention and Control", "https://ex.com/abc"),
        ("Swiss Federal Office of Public Health (BAG)", "https://www.bag.admin.ch/abc"),
        ("", "https://www.bag.admin.ch/abc"),
        ("台湾省疾病管制署", "https://www.cdc.gov.tw/abc"),
        ("", "https://www.cdc.gov.tw/abc"),
        ("Centers for Disease Control and Prevention", "https://www.cdc.gov/abc"),
        ("", "https://www.cdc.gov/abc"),
        ("Robert Koch Institute", "https://www.rki.de/abc"),
        ("Ministry of Health (UK)", "https://random.example.com/abc"),  # pattern wins
        ("Ministerio de Salud Argentina", "https://random.example.com/abc"),
        ("", "https://www.minsal.cl/abc"),                    # Chile health ministry
        ("", "https://www.argentina.gob.ar/salud/abc"),       # Argentina govt
    ],
)
def test_authoritative_passes(outlet: str, link: str) -> None:
    assert _is_authoritative_news_source(outlet, link), (
        f"expected {outlet!r} @ {link!r} to pass the authoritative filter"
    )


# ============================================================================
# REJECTED — these should be filtered out
# ============================================================================
@pytest.mark.parametrize(
    ("outlet", "link"),
    [
        # ---- Mainland commercial / secondary media (per user spec) ----
        ("thepaper.cn", "https://www.thepaper.cn/newsDetail_abc.html"),
        ("澎湃新闻", "https://www.thepaper.cn/abc"),
        ("中国新闻网", "https://www.chinanews.com.cn/abc"),
        ("chinanews.com.cn", "https://www.chinanews.com.cn/abc"),
        ("天津日报", "https://www.tjrb.com.cn/abc"),
        ("新京报", "https://www.bjnews.com.cn/abc"),
        ("观察者", "https://www.guancha.cn/abc"),
        ("财新", "https://www.caixin.com/abc"),
        ("界面新闻", "https://www.jiemian.com/abc"),
        ("人民日报", "https://www.people.com.cn/abc"),  # state media but NOT on user-approved list
        ("央视", "https://www.cctv.com/abc"),
        ("环球时报", "https://www.huanqiu.com/abc"),

        # ---- Overseas commercial press ----
        ("Reuters", "https://www.reuters.com/abc"),
        ("BBC", "https://www.bbc.com/news/abc"),
        ("NPR", "https://www.npr.org/abc"),
        ("CNN", "https://www.cnn.com/abc"),
        ("AP", "https://apnews.com/abc"),
        ("RFI", "https://www.rfi.fr/abc"),
        ("联合早报", "https://www.zaobao.com/abc"),

        # ---- Pathological inputs ----
        ("", ""),
        ("", "not a url"),
        ("Random Blog", "https://example.com/abc"),
    ],
)
def test_non_authoritative_rejected(outlet: str, link: str) -> None:
    assert not _is_authoritative_news_source(outlet, link), (
        f"expected {outlet!r} @ {link!r} to be REJECTED by the filter"
    )


# ============================================================================
# Edge cases worth pinning down
# ============================================================================
def test_outlet_case_insensitive() -> None:
    assert _is_authoritative_news_source("XINHUA", "https://random.com/abc")
    assert _is_authoritative_news_source("xinhua", "https://random.com/abc")


def test_host_subdomain_match() -> None:
    """Mainland *.gov.cn subdomains all pass via host-rule."""
    assert _is_authoritative_news_source("", "https://wjw.gd.gov.cn/abc")
    assert _is_authoritative_news_source("", "https://www.nhc.gov.cn/abc")
    # Not a gov.cn — must still fail
    assert not _is_authoritative_news_source("", "https://gov.cn.evil.example.com/abc")


def test_taiwan_cdc_via_outlet_pattern() -> None:
    """`疾病管制` pattern catches Taiwan CDC even from a third-party URL."""
    assert _is_authoritative_news_source(
        "台湾省疾病管制署",
        "https://news.google.com/articles/abc",
    )
