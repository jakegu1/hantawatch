"""Explore the correct ArcGIS FeatureServer schema."""
import json, sys
sys.path.insert(0, ".")
import httpx

URL = "https://services1.arcgis.com/wb4Og4gH5mvzQAIV/arcgis/rest/services/Tracking_Hantavirus_2026/FeatureServer"

with httpx.Client(timeout=15, follow_redirects=True) as c:
    r = c.get(URL + "?f=json")
    info = r.json()
    print("=== FeatureServer Info ===")
    print(f"Layers: {len(info.get('layers', []))}")
    for l in info.get('layers', []):
        print(f"  Layer {l['id']}: {l['name']}")

    for lid in [0, 1, 2]:
        try:
            r = c.get(f"{URL}/{lid}/query?f=json&where=1=1&outFields=*&returnGeometry=false&resultRecordCount=3&orderByFields=OBJECTID DESC")
            body = r.json()
            if "error" in body:
                print(f"\nLayer {lid}: ERROR — {body['error']['message']}")
                continue
            feats = body.get("features", [])
            total = len(feats)
            print(f"\n=== Layer {lid}: {total} features (showing up to 3) ===")
            for i, f in enumerate(feats[:3]):
                print(f"\n  Feature {i+1}:")
                attrs = f.get("attributes", {})
                for k, v in sorted(attrs.items()):
                    print(f"    {k}: {v}")
        except Exception as e:
            print(f"\nLayer {lid}: {e}")
