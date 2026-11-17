'use client';
import {useState} from 'react';
type Menu = {id:string;name:string;active:boolean;buttons:{id:string;text:string;action:string;targetFlowId:string}[]};
export default function SecretaryMenuTree({flows,mainMenuId,onEdit,onAdd,onNavigate}:{flows:Menu[];mainMenuId:string;onEdit:(id:string)=>void;onAdd:(id:string)=>void;onNavigate?:(id:string)=>void}) {
  const [history,setHistory]=useState<string[][]>([[]]),[position,setPosition]=useState(0);
  const path=history[position].filter(id=>flows.some(flow=>flow.id===id)),current=flows.find(flow=>flow.id===path.at(-1));
  const go=(next:string[])=>{setHistory([...history.slice(0,position+1),next]);setPosition(position+1);if(next.length)onNavigate?.(next.at(-1)!);};
  const travel=(next:number)=>{setPosition(next);const id=history[next].at(-1);if(id)onNavigate?.(id);};
  const incoming=new Set(flows.flatMap(flow=>flow.buttons.filter(button=>button.action==='flow'&&button.targetFlowId!==mainMenuId).map(button=>button.targetFlowId)));
  const roots=flows.filter(flow=>flow.id===mainMenuId||!incoming.has(flow.id));
  const rows=current?current.buttons.map(button=>({key:button.id,label:button.text,flow:button.action==='flow'?flows.find(flow=>flow.id===button.targetFlowId):undefined,kind:button.action==='url'?'Website':button.action==='reply'?'Reply':'Missing Target'})):(roots.length?roots:flows).map(flow=>({key:flow.id,label:flow.name,flow,kind:''}));
  return <section className="secretary-menu-tree" aria-label="Secretary Menu Hierarchy">
    <nav className="secretary-tree-nav" aria-label="Menu Navigation"><button type="button" disabled={position===0} onClick={()=>travel(position-1)}>← Back</button><button type="button" disabled={position===history.length-1} onClick={()=>travel(position+1)}>Forward →</button><button type="button" onClick={()=>go(mainMenuId&&flows.some(flow=>flow.id===mainMenuId)?[mainMenuId]:[])}>Main Menu</button><button type="button" onClick={()=>go([])}>All Roots</button></nav>
    <nav className="secretary-breadcrumbs" aria-label="Menu Breadcrumbs"><button type="button" onClick={()=>go([])}>Menus</button>{path.map((id,index)=><button type="button" key={index} onClick={()=>go(path.slice(0,index+1))}>› {flows.find(flow=>flow.id===id)?.name}</button>)}</nav>
    <div className="secretary-tree-heading"><strong>{current?.name||'Menu Roots'}</strong><span>{current?`Level ${path.length} · ${rows.length} Options`:`${flows.length} Menus`}</span></div>
    <div role="list">{rows.map(row=><div className="secretary-tree-row" role="listitem" key={row.key}><button type="button" disabled={!row.flow} onClick={()=>{if(row.flow)go([...path,row.flow.id]);}}><span>{row.label}</span><small>{row.flow?`${row.flow.active?'Active':'Inactive'} · ${row.flow.buttons.length} Options` : row.kind}</small>{row.flow&&<span aria-hidden="true">›</span>}</button>{row.flow&&<button type="button" aria-label={'Edit '+row.flow.name} onClick={()=>onEdit(row.flow!.id)}>Edit</button>}</div>)}</div>
    {!rows.length&&<p className="secretary-tree-empty">No Options Yet</p>}
    {current&&<div className="secretary-tree-nav"><button type="button" onClick={()=>onEdit(current.id)}>Edit This Menu</button><button type="button" onClick={()=>onAdd(current.id)}>Add Submenu</button></div>}
    <label className="secretary-menu-jump">Find Any Menu<select aria-label="Find Any Menu" value="" onChange={event=>{if(event.target.value)go([event.target.value]);}}><option value="">Choose Menu…</option>{flows.map(flow=><option key={flow.id} value={flow.id}>{flow.name}</option>)}</select></label>
  </section>;
}
