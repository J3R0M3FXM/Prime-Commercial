#!/usr/bin/env python3
"""Configure the private Prime R2 pilot without printing any credential values."""

import argparse
import hashlib
import json
import os
import secrets
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SOURCE = Path('/storage/emulated/0/Download/Cloudflare.txt')
STORE = Path('/data/data/com.termux/files/home/.config/prime-commercial/prime-media-preview-secrets.json')
TOKEN_NAME = 'prime-media-preview-worker-20261104'
WORKER_NAME = 'prime-media-preview'
BUCKET = 'prime-media-preview'
BUCKET_ITEM_WRITE = '2efd5506f9c8494dacb1fa10a3e7d5b6'


def source_values():
    result = {}
    for line in SOURCE.read_text().splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip()
    return result


def api(method, path, token, payload=None, timeout=30):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    with urlopen(Request('https://api.cloudflare.com/client/v4' + path, data=body, headers=headers, method=method), timeout=timeout) as response:
        result = json.loads(response.read())
        if not result.get('success'):
            raise RuntimeError('Cloudflare API rejected request: ' + str([error.get('code') for error in result.get('errors', [])]))
        return result['result']


def token_exists(account, token):
    rows = api('GET', f'/accounts/{account}/tokens', token)
    return any(row.get('name') == TOKEN_NAME for row in rows)


def create_token():
    values = source_values()
    account, token = values['ACCOUNT_ID'], values['API_TOKEN']
    if STORE.exists():
        print('Private scoped credentials already exist; no token created.')
        return
    if token_exists(account, token):
        raise RuntimeError('Scoped token name already exists but its secret is not in the private store. Inspect/revoke before retrying.')
    payload = {
        'name': TOKEN_NAME,
        'policies': [{
            'effect': 'allow',
            'permission_groups': [{'id': BUCKET_ITEM_WRITE}],
            'resources': {f'com.cloudflare.edge.r2.bucket.{account}_default_{BUCKET}': '*'},
        }],
    }
    try:
        result = api('POST', f'/accounts/{account}/tokens', token, payload)
    except (HTTPError, URLError):
        if token_exists(account, token):
            raise RuntimeError('Token may have been created but its secret was lost in transit. Revoke that new token before retrying.')
        raise
    if not result.get('id') or not result.get('value'):
        raise RuntimeError('Token created without a returned secret. Revoke it before retrying.')
    keys = {
        'ACCOUNT_ID': account,
        'R2_ACCESS_KEY_ID': result['id'],
        'R2_SECRET_ACCESS_KEY': hashlib.sha256(result['value'].encode()).hexdigest(),
        'TELEGRAM_BOT_TOKEN': values['TELEGRAM_BOT_TOKEN'],
        'ADMIN_TELEGRAM_IDS': ','.join(values[key] for key in ('CHAT_ADMIN_ID1', 'CHAT_ADMIN_ID2', 'CHAT_ADMIN_ID3')),
        'STREAM_SIGNING_KEY': secrets.token_urlsafe(48),
    }
    STORE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(STORE, os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as file:
        json.dump(keys, file)
    print('Bucket-scoped R2 token created; Worker secrets stored in private Termux file.')


def multipart_upload(path, token, metadata, module_path):
    boundary = 'prime-' + uuid.uuid4().hex
    module = module_path.read_bytes()
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n'.encode(),
        json.dumps(metadata).encode(), b'\r\n',
        f'--{boundary}\r\nContent-Disposition: form-data; name="worker.mjs"; filename="worker.mjs"\r\nContent-Type: application/javascript+module\r\n\r\n'.encode(),
        module, b'\r\n', f'--{boundary}--\r\n'.encode(),
    ]
    request = Request('https://api.cloudflare.com/client/v4' + path,
        data=b''.join(parts), method='PUT', headers={
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
        })
    try:
        with urlopen(request, timeout=45) as response:
            data = json.loads(response.read())
    except HTTPError as error:
        try:
            details = json.loads(error.read())
            codes = [entry.get('code') for entry in details.get('errors', [])]
        except Exception:
            codes = []
        raise RuntimeError(f'Worker upload HTTP {error.code}; Cloudflare error codes {codes}') from None
    if not data.get('success'):
        raise RuntimeError('Worker upload failed with codes ' + str([entry.get('code') for entry in data.get('errors', [])]))


def deploy_preview():
    values = source_values()
    account, token = values['ACCOUNT_ID'], values['API_TOKEN']
    private = json.loads(STORE.read_text())
    if private.get('ACCOUNT_ID') != account:
        raise RuntimeError('Scoped key belongs to a different account.')
    module = Path(__file__).parent / 'dist' / 'worker.mjs'
    if not module.is_file():
        raise RuntimeError('Build the Worker bundle first.')
    origins = ['https://app8830494959.tgcloud.ai', 'http://127.0.0.1:4193']
    scripts = api('GET', f'/accounts/{account}/workers/scripts', token)
    if any(item.get('id') == WORKER_NAME for item in scripts):
        raise RuntimeError('Preview Worker already exists; inspect it before any overwrite.')
    bindings = [
        {'type': 'r2_bucket', 'name': 'MEDIA_BUCKET', 'bucket_name': BUCKET},
        {'type': 'plain_text', 'name': 'CLOUDFLARE_ACCOUNT_ID', 'text': account},
        {'type': 'plain_text', 'name': 'ALLOWED_ORIGINS', 'text': ','.join(origins)},
    ]
    for name in ('R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'TELEGRAM_BOT_TOKEN', 'ADMIN_TELEGRAM_IDS', 'STREAM_SIGNING_KEY'):
        bindings.append({'type': 'secret_text', 'name': name, 'text': private[name]})
    metadata = {'main_module': 'worker.mjs', 'compatibility_date': '2026-11-04', 'bindings': bindings}
    multipart_upload(f'/accounts/{account}/workers/scripts/{WORKER_NAME}', token, metadata, module)
    print('Private R2 preview Worker uploaded with bucket binding and secret bindings.')
    api('POST', f'/accounts/{account}/workers/scripts/{WORKER_NAME}/subdomain', token, {'enabled': True, 'previews_enabled': False})
    subdomain = api('GET', f'/accounts/{account}/workers/subdomain', token)
    print('Worker URL:', f"https://{WORKER_NAME}.{subdomain['subdomain']}.workers.dev")
    cors_path = f'/accounts/{account}/r2/buckets/{BUCKET}/cors'
    try:
        existing = api('GET', cors_path, token)
    except HTTPError as error:
        if error.code != 404:
            raise
        existing = None
    if existing:
        raise RuntimeError('Bucket CORS policy already exists; inspect it before any overwrite.')
    cors = {'rules': [{'allowed': {'origins': origins, 'methods': ['PUT'], 'headers': ['Content-Type']}, 'exposeHeaders': ['ETag'], 'maxAgeSeconds': 3600}]}
    api('PUT', cors_path, token, cors)
    print('Exact-origin bucket CORS rule applied for live origin and local preview origin.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--create-token', action='store_true')
    parser.add_argument('--deploy-preview', action='store_true')
    args = parser.parse_args()
    if args.create_token == args.deploy_preview:
        parser.error('Specify exactly one of --create-token or --deploy-preview')
    try:
        if args.create_token:
            create_token()
        else:
            deploy_preview()
    except (HTTPError, URLError) as error:
        print('Cloudflare request failed:', getattr(error, 'code', type(error).__name__))
        raise SystemExit(1)
    except (KeyError, RuntimeError) as error:
        print('Setup stopped:', error)
        raise SystemExit(1)
