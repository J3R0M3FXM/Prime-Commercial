/** A device-local navigation preference, never an authorization credential. */
const key=(staffId:string)=>{
  if(!/^\d+$/.test(staffId))throw new Error('Verified staff identity is required.');
  return `prime_pos_launch_v1:${staffId}`;
};
export function prefersPosLaunch(staffId:string):boolean {
  try{return localStorage.getItem(key(staffId))==='1';}catch{return false;}
}
export function setPosLaunchPreference(staffId:string,enabled:boolean):void {
  if(enabled)localStorage.setItem(key(staffId),'1');
  else localStorage.removeItem(key(staffId));
}
