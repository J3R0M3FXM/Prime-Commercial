"use client";
import {useEffect,useState} from 'react';
import {prefersPosLaunch,setPosLaunchPreference} from '@/lib/pos-launch-preference';
type HomeScreenBridge={addToHomeScreen?:()=>void;checkHomeScreenStatus?:(callback:(status:string)=>void)=>void;isVersionAtLeast?:(version:string)=>boolean;onEvent?:(event:string,callback:()=>void)=>void;offEvent?:(event:string,callback:()=>void)=>void};
const bridge=()=>window.Telegram?.WebApp as HomeScreenBridge|undefined;
export default function PosHomeShortcut({staffId}:{staffId:string}){
  const [supported,setSupported]=useState(false),[preferred,setPreferred]=useState(()=>prefersPosLaunch(staffId)),[message,setMessage]=useState('');
  useEffect(()=>{
    const app=bridge();let active=true;
    if(!app?.addToHomeScreen||(app.isVersionAtLeast&&!app.isVersionAtLeast('8.0')))return;
    setSupported(true);
    try{app.checkHomeScreenStatus?.(status=>{if(active&&status==='unsupported')setSupported(false);});}catch{setSupported(false);}
    const added=()=>{if(active)setMessage('Shortcut added. Tap the Telegram app icon on your home screen to open POS.');};
    app.onEvent?.('homeScreenAdded',added);
    return ()=>{active=false;app.offEvent?.('homeScreenAdded',added);};
  },[]);
  const preference=(enabled:boolean)=>{
    try{setPosLaunchPreference(staffId,enabled);setPreferred(enabled);return true;}
    catch{setMessage('Could not save the POS launch preference on this device.');return false;}
  };
  const add=()=>{
    if(!preference(true))return;
    try{bridge()?.addToHomeScreen?.();setMessage('Confirm Add on Telegram’s home-screen prompt. Future launches on this device open POS.');}
    catch{setMessage('Telegram could not add the shortcut. Update Telegram and try again.');}
  };
  return <details className="pos-card pos-disclosure" aria-label="POS shortcut"><summary><span>Home Screen Shortcut</span></summary><div className="pos-card-body">
    {supported?<button type="button" className="pos-secondary pos-wide" onClick={add}>Add POS to Home Screen</button>:<p className="pos-hint">Use an updated Telegram mobile app to add a home-screen shortcut.</p>}
    <label className="pos-charge-option"><input type="checkbox" checked={preferred} onChange={event=>preference(event.target.checked)}/><span>Open POS by default on this device</span></label>
    {message&&<p role="status" className="pos-hint">{message}</p>}
  </div></details>;
}
