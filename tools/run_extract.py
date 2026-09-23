import json
from extract import extract_page

cal = json.load(open('calibration.json'))
results = []
for page in range(3, 10):
    want = 4 if page == 9 else 8
    results += extract_page(page, cal, want=want)

ok = [r for r in results if not r['problems']]
bad = [r for r in results if r['problems']]
print(f'transcribed {len(results)} boards — {len(ok)} valid, {len(bad)} flagged')
for r in bad:
    print(f"  pattern {r['number']:>2}: {r['marbles']} marbles — " + '; '.join(r['problems']))
json.dump(results, open('patterns.json', 'w'), indent=1)
