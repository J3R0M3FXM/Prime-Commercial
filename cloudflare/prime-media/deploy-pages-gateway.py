#!/usr/bin/env python3
"""Deploy the checked Pages Advanced Mode gateway without printing secrets."""
import importlib.util
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('configure_preview', Path(__file__).with_name('configure-preview.py'))
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)
values = config.source_values()
account = values['ACCOUNT_ID']
token = values['API_TOKEN']
worker = Path(__file__).parent / 'pages-gateway' / '_worker.js'
boundary = '----prime-pages-gateway'
parts = []
def field(name, value):
    parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()])
def file_field(name, filename, content, content_type):
    parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode(), content, b'\r\n'])
field('branch', 'main')
field('manifest', '{}')
field('commit_message', 'Deploy Prime Media R2 gateway adapter')
field('commit_dirty', 'false')
file_field('_worker.js', '_worker.js', worker.read_bytes(), 'application/javascript')
parts.append(f'--{boundary}--\r\n'.encode())
request = Request(
    f'https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/prime-media-gateway/deployments',
    data=b''.join(parts), method='POST', headers={
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Accept': 'application/json',
    },
)
try:
    with urlopen(request, timeout=60) as response:
        result = json.loads(response.read())
except HTTPError as error:
    try:
        detail = json.loads(error.read())
        codes = [(entry.get('code'), entry.get('message')) for entry in detail.get('errors', [])]
    except Exception:
        codes = []
    raise SystemExit(f'Pages deployment HTTP {error.code}; Cloudflare error codes {codes}')
if not result.get('success'):
    raise SystemExit('Pages deployment failed: ' + str([e.get('code') for e in result.get('errors', [])]))
deployment = result['result']
print('Pages gateway deployment:', deployment.get('id'))
print('Pages gateway URL:', deployment.get('url'))
