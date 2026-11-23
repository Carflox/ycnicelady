import assert from 'node:assert/strict';
import handler from './appwrite-functions/catalog/main.js';
Object.assign(process.env,{APPWRITE_PROJECT_ID:'test-project',APPWRITE_API_KEY:'test-key',APPWRITE_DATABASE_ID:'test-db',APPWRITE_PRODUCTS_TABLE_ID:'test-table',APPWRITE_ANALYTICS_TABLE_ID:'analytics-table'});
const oldFetch=globalThis.fetch;
const rows=[{$id:'b',name:'Producto B',price:12,stock:3,is_active:true,sort_order:2},{$id:'a',name:'Producto A',price:8,stock:2,is_active:true,sort_order:1},{$id:'x',name:'Oculto',price:4,stock:9,is_active:false,sort_order:0}];
let payload,status;const res={json:(data,s=200)=>{payload=data;status=s;return data}};
globalThis.fetch=async(url,opts)=>({ok:true,status:200,json:async()=>({rows})});
await handler({req:{bodyJson:{}},res,log(){},error(){}});assert.equal(status,200);assert.equal(payload.length,2);assert.equal(payload[0].id,'a');assert.equal(payload[1].id,'b');
let decrements=0;const orderEvents=[];globalThis.fetch=async(url,opts)=>{if(url.endsWith('/rows/a'))return {ok:true,status:200,json:async()=>rows[1]};if(url.endsWith('/rows/a/stock/decrement')){decrements++;return {ok:true,status:200,json:async()=>({})}};if(url.includes('/tables/analytics-table/rows'))orderEvents.push(JSON.parse(opts.body).data);return {ok:true,status:200,json:async()=>({})};};
await handler({req:{bodyJson:{order_items:[{id:'a',quantity:2}]}},res,log(){},error(){}});assert.equal(status,200);assert.equal(payload.success,true);assert.equal(decrements,1);assert.deepEqual(orderEvents,[{event_type:'whatsapp_click',created_at:orderEvents[0].created_at,product_id:'a',product_name:'Producto A',quantity:2}]);
let eventRequest;globalThis.fetch=async(url,opts)=>{eventRequest={url,body:JSON.parse(opts.body)};return {ok:true,status:201,json:async()=>({})};};
for(const eventType of ['catalog_view','product_view','add_to_cart']){await handler({req:{bodyJson:{event_type:eventType,product_id:'p1',product_name:'Producto',quantity:99999,created_at:'spoofed'}},res,log(){},error(){}});assert.equal(status,200);assert.equal(payload.success,true);assert.match(eventRequest.url,/tables\/analytics-table\/rows$/);assert.equal(eventRequest.body.data.event_type,eventType);assert.equal(eventRequest.body.data.quantity,1000);assert.notEqual(eventRequest.body.data.created_at,'spoofed');}
await handler({req:{bodyJson:{event_type:'whatsapp_click',product_id:'p1'}},res,log(){},error(){}});assert.equal(status,400);assert.equal(payload.success,false);
await handler({req:{bodyJson:{event_type:'unexpected'}},res,log(){},error(){}});assert.equal(status,400);assert.equal(payload.success,false);
const analyticsTable=process.env.APPWRITE_ANALYTICS_TABLE_ID;delete process.env.APPWRITE_ANALYTICS_TABLE_ID;let rollbackIncrements=0;globalThis.fetch=async(url,opts)=>{if(url.endsWith('/rows/a'))return {ok:true,status:200,json:async()=>rows[1]};if(url.endsWith('/stock/decrement'))return {ok:true,status:200,json:async()=>({})};if(url.endsWith('/stock/increment'))rollbackIncrements++;return {ok:true,status:200,json:async()=>({})};};
await handler({req:{bodyJson:{order_items:[{id:'a',quantity:1}]}},res,log(){},error(){}});assert.equal(status,503);assert.equal(rollbackIncrements,1);process.env.APPWRITE_ANALYTICS_TABLE_ID=analyticsTable;
globalThis.fetch=oldFetch;console.log('PASS: catálogo, reserva de stock y recepción de Analytics.');
