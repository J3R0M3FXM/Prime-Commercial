"use client";
import { useState } from "react";
import { callServerless } from "@/lib/telegram-serverless-client";
async function gateway(path:string,method="GET",body?:object){
 const initData=(window as any).Telegram?.WebApp?.initData||"";
 const response=await fetch(`https://prime-media-gateway.pages.dev/sms/${path}`,{method,headers:{"Content-Type":"application/json","X-Telegram-Init-Data":initData},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||"Bridge unavailable.");return result;
}
export default function SmsBridgePanel(){
 const [devices,setDevices]=useState<any[]>([]),[code,setCode]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function perform(action:()=>Promise<void>){setBusy(true);setMessage("");try{await action();}catch(error:any){setMessage(error.message||"Bridge unavailable.");}finally{setBusy(false);}}
 async function load(){const [list,status]=await Promise.all([gateway("devices"),callServerless<any>("manageSmsEvidence",{action:"status"})]);setDevices(list.devices||[]);setMessage(status.configured?"Server ready. Only MayaBiz confirmations are accepted.":"Server connection is awaiting configuration.");}
 return <details className="serverless-disclosure my-2"><summary>Owner phone · SMS Bridge</summary><div className="serverless-disclosure__body space-y-2 text-xs">
 <p>Install PRIME SMS Bridge on the payment phone, pair it here, then enable SMS forwarding and its listening notification. Staff still review each payment.</p>
 <div className="flex flex-wrap gap-2"><button disabled={busy} className="serverless-action" onClick={()=>void perform(load)}>Refresh phones</button><button disabled={busy} className="serverless-action" onClick={()=>void perform(async()=>{const result=await gateway("pairing","POST",{label:"Owner payment phone"});setCode(result.code);setMessage("Pairing code expires in ten minutes.");})}>Create pairing code</button></div>
 {code&&<div className="space-y-2"><p className="break-all font-mono select-all">{code}</p><div className="flex gap-2"><button className="serverless-action" onClick={()=>void perform(async()=>{await navigator.clipboard.writeText(code);setMessage("Pairing code copied.");})}>Copy</button><a className="serverless-action" href={`prime-sms://pair?code=${code}`}>Open SMS Bridge</a></div></div>}
 {message&&<p role="status">{message}</p>}
 {devices.map(device=><div className="border-t pt-2" key={device.id}><p>{device.label} · {device.revoked?"Revoked":"Paired"}</p><p className="font-mono">Last received: {device.lastSeen?new Date(device.lastSeen).toLocaleString():"None yet"}</p>{!device.revoked&&<button disabled={busy} className="serverless-action" onClick={()=>{if(window.confirm("Revoke this phone's forwarding access?"))void perform(async()=>{await gateway(`devices/${device.id}`,"DELETE");await load();});}}>Revoke phone</button>}</div>)}
 </div></details>;
}
export function ReceiptSmsEvidence({orderId}:{orderId:string}){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function check(){setBusy(true);setError("");try{setData(await callServerless("manageSmsEvidence",{action:"check",orderId},60000));}catch(error:any){setError(error.message||"Receipt check unavailable.");}finally{setBusy(false);}}
 const receipt=data?.receipt,result=data?.result;
 return <details className="serverless-disclosure"><summary>Receipt reference &amp; payment SMS</summary><div className="serverless-disclosure__body space-y-2 text-xs"><p>Compare the original receipt with MayaBiz confirmation. This check does not approve payment.</p><button className="serverless-action" disabled={busy} onClick={()=>void check()}>{busy?"Checking receipt and SMS…":"Scan receipt & check SMS"}</button>{error&&<p role="alert">{error}</p>}{receipt&&<div className="font-mono break-all"><p>Provider: {receipt.provider||"Unknown"}</p><p>{({bpi:"Transaction Ref. No.",gcash:"QRPH Invoice No.",maya_wallet:"Reference ID",maya_email:"Maya Transaction No.",maribank_seabank:"Reference Number",unionbank:"Instapay Reference Number"} as Record<string,string>)[receipt.provider]||"Reference"}: {receipt.fullReference||receipt.reference||"Not found"}</p><p>Match value: {receipt.reference||"Not found"}</p><p>Amount: {receipt.amountCents==null?"Not found":`PHP ${(receipt.amountCents/100).toFixed(2)}`}</p><p>Paid: {receipt.paidAt||"Time not found"}</p></div>}{result&&<p role="status">{String(result.status).replace(/_/g," ")} · Staff review required</p>}</div></details>;
}
