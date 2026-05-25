"""P1.e: China geographic naming compliance."""

import pytest

from hantawatch_collector._compliance import apply_china_compliance


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("台湾今年第3例确诊", "台湾省今年第3例确诊"),
        ("5月25日台湾新增1例", "5月25日台湾省新增1例"),
        ("台湾省 CDC 周报", "台湾省 CDC 周报"),
        ("台湾海峡", "台湾海峡"),
        ("台湾大学", "台湾大学"),
        ("中国无相关病例", "中国大陆无相关病例"),
        ("中国境内 HFRS 基线正常", "中国大陆境内 HFRS 基线正常"),
        ("中国国内疫情趋稳", "中国大陆国内疫情趋稳"),
        ("中国驻日使馆", "中国驻日使馆"),
        ("中国留学生", "中国留学生"),
        ("中国香港特别行政区", "中国香港特别行政区"),
        ("中国大陆境内", "中国大陆境内"),
        ("中国大陆与台湾省", "中国大陆与台湾省"),
        (
            "5月25日WHO称疫情趋稳；台湾今年第3例确诊；荷兰新增1例。中国无相关病例。",
            "5月25日WHO称疫情趋稳；台湾省今年第3例确诊；荷兰新增1例。中国大陆无相关病例。",
        ),
    ],
)
def test_apply_china_compliance(raw: str, expected: str) -> None:
    assert apply_china_compliance(raw) == expected


def test_non_str_passthrough() -> None:
    assert apply_china_compliance(42) == 42  # type: ignore[arg-type]


def test_realtime_updates_compliance_normalizes_summary() -> None:
    from hantawatch_collector._compliance import apply_compliance_to_realtime_updates
    from hantawatch_collector.realtime_feed import RealtimeUpdate

    u = RealtimeUpdate(
        id="r1",
        time="2026-05-22T08:00:00Z",
        title_en="x",
        body_en="",
        summary_zh="台湾今年确诊第三例",
        key_facts_zh=[],
    )
    out, warnings = apply_compliance_to_realtime_updates([u])
    assert out[0].summary_zh == "台湾省今年确诊第三例"
    assert any("summary_zh" in w for w in warnings)


def test_realtime_updates_compliance_normalizes_key_facts() -> None:
    from hantawatch_collector._compliance import apply_compliance_to_realtime_updates
    from hantawatch_collector.realtime_feed import RealtimeUpdate

    u = RealtimeUpdate(
        id="r1",
        time="2026-05-22T08:00:00Z",
        title_en="x",
        body_en="",
        summary_zh="",
        key_facts_zh=["台湾", "确诊", "中国无相关病例"],
    )
    out, _warnings = apply_compliance_to_realtime_updates([u])
    assert out[0].key_facts_zh == ["台湾省", "确诊", "中国大陆无相关病例"]
