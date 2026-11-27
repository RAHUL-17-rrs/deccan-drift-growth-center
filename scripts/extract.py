"""Convert the two supplied workbooks to typed PostgreSQL input using only the standard library."""
import csv, datetime as dt, io, json, re, sys, zipfile
from xml.etree import ElementTree as ET

ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def workbook(path):
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rel = {x.get('Id'):x.get('Target') for x in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        shared = [''.join(t.text or '' for t in x.findall('.//s:t',ns)) for x in ET.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in z.namelist() else []
        data = {}
        for sh in wb.findall('.//s:sheet',ns):
            target = rel[sh.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
            sheet = ET.fromstring(z.read(target.lstrip('/') if target.startswith('/') else 'xl/'+target))
            rows = {}
            for row in sheet.findall('.//s:sheetData/s:row', ns):
                cells = {}
                for c in row.findall('s:c',ns):
                    v = c.findtext('s:v',None,ns)
                    if c.get('t')=='s' and v is not None: v=shared[int(v)]
                    elif c.get('t')=='inlineStr': v=''.join(t.text or '' for t in c.findall('.//s:t',ns))
                    if v not in (None,''): cells[re.match('[A-Z]+',c.get('r'))[0]]=v
                if cells: rows[int(row.get('r'))]=cells
            data[sh.get('name')]=rows
    return data

sources={'Event':'event','Targets':'targets','Campaigns':'campaigns','Daily Marketing':'marketing','People':'people','Interest and Engagement':'engagement','Registrations':'registrations','Registration History':'history','Check-ins':'checkins','Field guide':'data_dictionary'}
keys={'event':'event_name','targets':'effective_at','campaigns':'campaign_id','marketing':'activity_id','people':'person_id','engagement':'interaction_id','registrations':'registration_id','history':'history_id','checkins':'event_id'}
counts=[1,2,7,483,3685,11650,2840,5911,3390]
def copy(table,cols,rows):
    print('COPY '+table+' ('+','.join('"'+c+'"' for c in cols)+') FROM STDIN WITH (FORMAT csv, NULL \'\');')
    writer=csv.writer(sys.stdout,lineterminator='\n')
    writer.writerows(rows)
    print(r'\.')
def main():
    book=workbook('Attendee_Dataset.xlsx')
    for idx,(sheet,table) in enumerate(sources.items()):
        values=book[sheet]; header=values[1]; columns=list(header.values())
        if table in keys: assert len(values)-1==counts[idx], (sheet,len(values)-1)
        defs=[]
        def dtype(c):
            if c.endswith('_at'): return 'timestamptz'
            if c in ('activity_date','history_start','history_end'): return 'date'
            if c.endswith(('_goal','_inr')) or c in ('impressions','clicks','reported_reach','landing_page_sessions','registration_starts'): return 'bigint'
            if c=='fictional': return 'boolean'
            return 'text'
        for c in columns: defs.append('"'+c+'" '+dtype(c)+(' not null' if c==keys.get(table) else ''))
        name='raw_'+table if table in keys else table
        print('CREATE TABLE '+name+' (rid bigint generated always as identity primary key,'+','.join(defs)+');')
        records=[]
        for i,fields in values.items():
            if i==1:continue
            record=[]
            for letter,c in header.items():
                v=fields.get(letter)
                if v is not None and dtype(c) in ('date','timestamptz'):
                    date=dt.datetime(1899,12,30)+dt.timedelta(seconds=round(float(v)*86400))
                    v=date.date().isoformat() if dtype(c)=='date' else date.isoformat()+'+05:30'
                elif v is not None and dtype(c)=='bigint': v=int(float(v))
                record.append(v)
            records.append(record)
        copy(name,columns,records)
        if table in keys:
            key=keys[table]
            print(f'CREATE INDEX ON {name} ({key},rid desc);')
            print(f'CREATE VIEW clean_{table} AS SELECT DISTINCT ON ({key}) * FROM {name} ORDER BY {key},rid desc;')
    plan=workbook('DeccanDrift_Pune_2027_Model.xlsx')
    funnel,threshold=plan['Funnel Model'],plan['Thresholds']
    signals={r.get('A'):r.get('G') for r in threshold.values()}
    print('CREATE TABLE plan_channels(name text primary key,regs numeric,showup numeric,attendees numeric,spend numeric,stretch_regs numeric,stretch_attendees numeric,stretch_spend numeric,bet text,signal text);')
    copy('plan_channels','name regs showup attendees spend stretch_regs stretch_attendees stretch_spend bet signal'.split(), [[r.get(k) for k in ('A','H','C','I','J','N','O','P','R')]+[signals.get(r['A']) or (signals.get('Get-There Guarantee') if i==12 else None)] for i,r in funnel.items() if 3<=i<=13])
    print('CREATE TABLE plan_gates(name text primary key, timing text, rule text, value numeric, multiplier numeric);')
    copy('plan_gates',['name','timing','rule','value','multiplier'],[[r['A'],r['B'],r['C'],r['D'],{16:0.9,17:0.95}.get(i,1)] for i,r in threshold.items() if i in range(16,20)]+[['Holdback','Each stage','Share of released funds moved to the best channel',0.05,1]])
    print("CREATE TABLE benchmarks(name text primary key, showup numeric);")
    copy('benchmarks',['name','showup'],[[r['A'],float(r['H'])/float(r['F'])] for i,r in plan['Benchmarks 2025'].items() if 2<=i<=8])
if __name__=='__main__': main()

