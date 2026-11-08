#!/usr/bin/env python3
"""Update only the existing media Worker, preserving remote bindings and secrets."""
import argparse
import importlib.util
from pathlib import Path


def metadata(settings):
    bindings = settings.get('bindings', [])
    bucket = [b for b in bindings if b.get('name') == 'MEDIA_BUCKET']
    if len(bucket) != 1 or bucket[0].get('bucket_name') != 'prime-media-preview':
        raise RuntimeError('Unexpected media bucket binding; refusing update.')
    required = {'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'TELEGRAM_BOT_TOKEN',
                'ADMIN_TELEGRAM_IDS', 'STREAM_SIGNING_KEY'}
    if not required.issubset({b['name'] for b in bindings if b.get('type') == 'secret_text'}):
        raise RuntimeError('Required remote secrets are missing; refusing update.')
    return {'main_module': 'worker.mjs',
            'compatibility_date': settings['compatibility_date'],
            'compatibility_flags': settings.get('compatibility_flags', []),
            'bindings': [b for b in bindings if b.get('type') != 'secret_text'],
            'keep_bindings': ['secret_text']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deploy', action='store_true')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('config', Path(__file__).with_name('configure-preview.py'))
    config = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(config)
    try:
        values = config.source_values()
        path = f"/accounts/{values['ACCOUNT_ID']}/workers/scripts/prime-media-preview"
        settings = config.api('GET', path + '/settings', values['API_TOKEN'])
        upload = metadata(settings)
        bundle = Path(__file__).parent / 'dist' / 'worker.mjs'
        if not bundle.is_file():
            raise RuntimeError('Validated Worker bundle missing.')
        if args.deploy:
            config.multipart_upload(path, values['API_TOKEN'], upload, bundle)
            print('Existing media Worker updated; remote secrets and bucket retained.')
        else:
            print('Existing Worker bindings checked; no changes made.')
    except Exception as error:
        print('Worker update stopped:', type(error).__name__)
        raise SystemExit(1)
