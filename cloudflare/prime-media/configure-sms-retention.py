#!/usr/bin/env python3
"""Add SMS-only object expiry rules while preserving every existing bucket rule."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('config',Path(__file__).with_name('configure-preview.py'))
config=importlib.util.module_from_spec(spec);spec.loader.exec_module(config)
values=config.source_values();path=f"/accounts/{values['ACCOUNT_ID']}/r2/buckets/prime-media-preview/lifecycle"
current=config.api('GET',path,values['API_TOKEN'])
rules=current.get('rules',[])
for name,days in [('events',30),('index',30),('pair',1)]:
 rule={'id':'prime-payment-sms-'+name,'enabled':True,'conditions':{'prefix':'payment-sms/'+name+'/'},'deleteObjectsTransition':{'condition':{'type':'Age','maxAge':days*86400}}}
 found=[item for item in rules if item['id']==rule['id']]
 if found and found[0]!=rule:raise RuntimeError('Existing SMS retention rule differs; inspect before replacing.')
 if not found:rules.append(rule)
config.api('PUT',path,values['API_TOKEN'],{'rules':rules})
verified=config.api('GET',path,values['API_TOKEN'])
assert all(any(row==rule for row in verified.get('rules',[])) for rule in rules)
print('SMS event/index expiry: 30 days; pairing expiry: one day; pre-existing rules preserved.')
