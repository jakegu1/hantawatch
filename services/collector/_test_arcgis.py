import json, sys
sys.path.insert(0, ".")
from hantawatch_collector.andv_dashboard import fetch_andv_data

data = fetch_andv_data()
if data:
    print(json.dumps(data, indent=2, ensure_ascii=False))
else:
    print("NULL — ArcGIS returned no data (network blocked or layers empty)")
