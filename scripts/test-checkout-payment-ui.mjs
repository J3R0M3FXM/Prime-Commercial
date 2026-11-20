import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {build} from 'rolldown';
const require=createRequire(import.meta.url);
const source=readFileSync('app/components/checkout-modal.tsx','utf8');
const tree=ts.createSourceFile('checkout.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const expressions=[];
function visit(node){
 if(ts.isJsxExpression(node)&&node.expression){
  const text=node.expression.getText(tree);
  if((text.startsWith('currentStep === 5 && (')&&text.includes('prime-checkout__payment-section'))||text.startsWith('isPaymentDetailsModalOpen && selectedPaymentMethod && (')||text.startsWith('isPaymentQrModalOpen && zoomedPaymentMethod && (')||text.startsWith('isReceiptModalOpen && selectedPaymentMethod && currentStep === 5 && ('))expressions.push(node.getText(tree));
 }
 ts.forEachChild(node,visit);
}
visit(tree);assert.equal(expressions.length,4,'Use the real payment step, instruction modals and receipt notice');
const fixture=`import React,{useState,useRef} from 'react';
import {Loader2,AlertTriangle,QrCode,ShieldCheck,CheckCircle2} from 'lucide-react';
const methods=[{id:'bank',name:'Bank',accountName:'PRIME',accountNumber:'0123456789'},{id:'qr',name:'QR',type:'qr',qrCodeImage:'https://example.com/qr.png',instructions:'Scan this code'},{id:'gateway',name:'Gateway',type:'secured_payment_link',paymentLinkUrl:'https://example.com/pay'}];
const CheckoutPaymentReminder=()=>null;
const CheckoutPaymentSwitch=({showPicker,picker,selection})=>showPicker?picker:selection;
const CheckoutTileLogo=({name})=><span>{name}</span>;
const TelegramMediaImage=props=><img {...props}/>;
const SecuredPaymentLink=({url})=><a href={url}>Open Secure Payment Page</a>;
const selectorTileClass=()=>'',selectorLabelClass='';
export default function Fixture(){
 const [selectedPaymentMethod,setSelectedPaymentMethod]=useState(null),[isChoosingPaymentMethod,setIsChoosingPaymentMethod]=useState(false);
 const [isPaymentQrModalOpen,setIsPaymentQrModalOpen]=useState(false),[isPaymentDetailsModalOpen,setIsPaymentDetailsModalOpen]=useState(false),[isReceiptModalOpen,setIsReceiptModalOpen]=useState(false),[zoomedPaymentMethod,setZoomedPaymentMethod]=useState(null);
 const [uploadedProofImage,setUploadedProofImage]=useState(''),[ocrAnalysis,setOcrAnalysis]=useState(null),[ocrError,setOcrError]=useState(''),[isAnalyzingReceipt,setIsAnalyzingReceipt]=useState(false),[copiedField,setCopiedField]=useState(null);
 const [currentPaymentPage,setCurrentPaymentPage]=useState(0),[paymentPageDirection,setPaymentPageDirection]=useState(1);
 const setSubmitError=()=>{},setPaymentMethodsReloadKey=()=>{},setIsPreviewProofOpen=()=>{},analyzeReceiptImage=()=>{},receiptScanVersion=useRef(0),preSubmitProofInputRef=useRef(null);
 const paymentMethods=methods,currentStep=5,payableNow=100,payableOnDelivery=50,deliveryPaymentMethod='upon_delivery',isLoadingPaymentMethods=false,paymentMethodsLoadError=false,isConfirmingCodes=false,isSubmittingProof=false;
 const confirmCheckoutCodes=async()=>true,handleTouchStart=()=>{},handleTouchMove=()=>{},handleTouchEnd=()=>{},handleAttachPreSubmitProof=()=>{setUploadedProofImage('receipt');setOcrAnalysis({valid:true})};
 return <>${expressions.join('\n')}
 </>;
}`;
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.com'});
for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const bundled=await build({input:'virtual-checkout.tsx',write:false,platform:'node',tsconfig:false,transform:{jsx:{runtime:'automatic'}},onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},plugins:[{name:'fixture',resolveId(id){if(id==='virtual-checkout.tsx')return '\0fixture.tsx';if(id==='react'||id.startsWith('react/')||id==='lucide-react')return {id:pathToFileURL(require.resolve(id)).href,external:true};},load(id){if(id==='\0fixture.tsx')return fixture;}}],output:{format:'esm'}});
const {default:Fixture}=await import('data:text/javascript;base64,'+Buffer.from(bundled.output[0].code).toString('base64'));
const {createElement,act}=await import('react');const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
await act(async()=>root.render(createElement(Fixture)));
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
async function click(text){assert.ok(button(text),'Missing '+text);await act(async()=>button(text).click());}
await click('Bank');
assert.ok(document.querySelector('[aria-label="Payment instructions"]'));
assert.ok(document.body.textContent.includes('0123456789'));
await click('Done');
assert.equal(document.querySelector('[role="dialog"]'),null,'Done dismisses instructions');
assert.equal(document.querySelector('[aria-label="Payment receipt upload"]'),null,'Done does not auto-open receipt upload');
assert.equal(button('Bank'),undefined,'Tiles disappear after choosing');
assert.ok(document.querySelector('[aria-label="Selected payment method actions"]').classList.contains('grid-cols-2'));
await click('Upload Payment Receipt');
assert.ok(document.body.textContent.includes('SERVICE PROCESS NOTICE'));
assert.ok(document.body.textContent.includes('encrypted connection'));
let pickerOpened=false;const input=document.querySelector('input[type="file"]');input.click=()=>{pickerOpened=true};
await click('ATTACH PAYMENT RECEIPT');assert.equal(pickerOpened,true,'Attach opens the receipt picker');
Object.defineProperty(input,'files',{value:[new window.File(['receipt'],'receipt.png',{type:'image/png'})],configurable:true});
await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
await click('Done');
assert.ok(button('Review Payment Receipt'));
await click('Change Payment Method');assert.ok(button('QR'));await click('Keep Bank');assert.ok(button('Review Payment Receipt'),'Cancelling a method change preserves proof');
await click('Change Payment Method');await click('Bank');await click('Done');assert.ok(button('Review Payment Receipt'),'Reselecting the same method preserves proof');
await click('Change Payment Method');await click('QR');
assert.ok(document.querySelector('[aria-label="Payment QR instructions"]'));
assert.ok(document.body.textContent.includes('Scan this code'));
await click('Done');assert.ok(button('Upload Payment Receipt'),'Changing method clears the old proof');
assert.equal(document.querySelector('[aria-label="Payment receipt upload"]'),null);
await click('Change Payment Method');await click('Gateway');
assert.ok(document.querySelector('[aria-label="Payment instructions"] a[href="https://example.com/pay"]'));
await click('Done');assert.ok(button('Change Payment Method'));assert.ok(button('Upload Payment Receipt'));
await act(async()=>root.unmount());
console.log('PASS: real checkout JSX for bank/QR/gateway instructions, Done without auto-upload, two-column actions, picker reopening, cancellation and proof reset only for a different method.');
