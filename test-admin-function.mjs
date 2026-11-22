import assert from 'node:assert/strict';
import admin from './appwrite-functions/admin/main.js';
Object.assign(process.env,{APPWRITE_PROJECT_ID:'test',APPWRITE_API_KEY:'test-key',APPWRITE_DATABASE_ID:'db',APPWRITE_PRODUCTS_TABLE_ID:'products',ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'safe-test-pass',ADMIN_SESSION_SECRET:'a-long-test-secret'});
const rows=[{$id:'p1',name:'P1',price:10,stock:4,is_active:true,sort_order:1}];
const oldFetch=globalThis.fetch;const calls=[];
globalThis.fetch=async(url,opts)=>{calls.push({url,opts});let data;if(url.includes('/rows?'))data={rows};else if(url.endsWith('/rows'))data={$id:'new'};else data={};return {ok:true,status:200,json:async()=>data};};
async function run(body){let result,status=200;const res={json:(d,s=200)=>{result=d;status=s;return d}};await admin({req:{bodyJson:body},res,log(){},error(){}});return {result,status};}
const login=await run({action:'login',email:'admin@example.test',password:'safe-test-pass'});assert.equal(login.status,200);assert.ok(login.result.token);
const list=await run({action:'products.list',token:login.result.token});assert.equal(list.status,200);assert.equal(list.result.products.length,1);assert.equal(list.result.products[0].id,'p1');
const unauth=await run({action:'products.list',token:'invalid'});assert.equal(unauth.status,401);
const badLogin=await run({action:'login',email:'admin@example.test',password:'wrong'});assert.equal(badLogin.status,401);
const session=await run({action:'session',token:login.result.token});assert.equal(session.status,200);
globalThis.fetch=oldFetch;console.log('PASS: login, token firmado, sesión, protección 401 y lectura de catálogo.');
