import pypdf
r = pypdf.PdfReader(r'C:\Users\Isaiah\farm-advisory-agent\SYSTEM_DESIGN.pdf')
print('pages:', len(r.pages))
for i, pg in enumerate(r.pages):
    t = pg.extract_text() or ''
    up = t.upper()
    label = 'DIAGRAM' if ('FARMER ON WHATSAPP' in up or 'ORCHESTRATOR' in up or 'OBSERVABILITY' in up) else ('ER-TABLE' if 'STORE {' in t or 'REPORTS {' in t else 'text')
    print('page', i+1, label, 'chars=', len(t))
print('---')
print('has Stack section:', any('Stack' in (pg.extract_text() or '') for pg in r.pages))
print('has ER verbatim STORE:', any('STORE {' in (pg.extract_text() or '') for pg in r.pages))