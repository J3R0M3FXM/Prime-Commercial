import { db } from 'sdk';
import { ensureOrderWorkflow,orderWorkflowColumns,customerWorkflowColumns,workflowDefinitions } from '../lib/order-workflow.js';

/** Owner CLI template, never deployed. Reports schema names only, never customer or order records. */
export default async function(input={}) {
  if(input.prepare===true)await ensureOrderWorkflow();
  const orderColumns=new Set((await db.all("SELECT name FROM pragma_table_info('orders')")).map(row=>row.name));
  const customerColumns=new Set((await db.all("SELECT name FROM pragma_table_info('customers')")).map(row=>row.name));
  const missingColumns=[...orderWorkflowColumns.filter(([name])=>!orderColumns.has(name)).map(([name])=>'orders.'+name),...customerWorkflowColumns.filter(([name])=>!customerColumns.has(name)).map(([name])=>'customers.'+name)];
  const missingObjects=[];
  for(const [type,name] of workflowDefinitions)if(!await db.get('SELECT name FROM sqlite_master WHERE type=:type AND name=:name',{':type':type,':name':name}))missingObjects.push(name);
  return {ready:!missingColumns.length&&!missingObjects.length,missingColumns,missingObjects,prepared:input.prepare===true};
}
