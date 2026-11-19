#!/usr/bin/env python3
"""Build the small native SMS APK with Termux Android tools; never bundle secrets."""
from pathlib import Path
import os,subprocess,shutil,zipfile,secrets
root=Path(__file__).resolve().parent
build=root/'build';build.mkdir(exist_ok=True)
sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'android-sdk')))
jar=sdk/'platforms/android-35/android.jar'
if not jar.is_file():raise SystemExit('Android 35 platform android.jar is required')
def run(*args):subprocess.run([str(arg) for arg in args],check=True,cwd=root)
for name in ('classes','dex','generated'):
 shutil.rmtree(build/name,ignore_errors=True);(build/name).mkdir()
run('aapt2','compile','--dir',root/'res','-o',build/'resources.zip')
resources=Path(os.environ.get('ANDROID_RESOURCES','/system/framework/framework-res.apk'))
if not resources.is_file():resources=jar
run('aapt2','link','-o',build/'unsigned.apk','-I',resources,'--manifest',root/'AndroidManifest.xml','--java',build/'generated','--min-sdk-version','26','--target-sdk-version','35','-A',root/'assets',build/'resources.zip')
run('javac','--release','8','-cp',jar,'-d',build/'classes',*sorted((root/'src').rglob('*.java')))
run('d8','--min-api','26','--lib',jar,'--output',build/'dex',*sorted((build/'classes').rglob('*.class')))
with zipfile.ZipFile(build/'unsigned.apk','a') as apk:apk.write(build/'dex/classes.dex','classes.dex')
private=Path.home()/'.config/prime-commercial/sms-bridge-signing';private.mkdir(parents=True,exist_ok=True,mode=0o700)
pw=private/'password';key=private/'bridge.jks'
if not pw.exists():
 fd=os.open(pw,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as file:file.write(secrets.token_urlsafe(32))
if not key.exists():run('keytool','-genkeypair','-alias','prime-sms-bridge','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=PRIME SMS Bridge','-keystore',key,'-storepass:file',pw,'-keypass:file',pw)
source=build/'unsigned.apk'
if shutil.which('zipalign'):
 run('zipalign','-f','4',source,build/'aligned.apk');source=build/'aligned.apk'
output=build/'PRIME-SMS-Bridge.apk'
run('apksigner','sign','--ks',key,'--ks-key-alias','prime-sms-bridge','--ks-pass','file:'+str(pw),'--out',output,source)
run('apksigner','verify','--verbose',output)
print('Built',output,'('+str(output.stat().st_size)+' bytes)')
