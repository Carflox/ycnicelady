// YC NICE LADY — Admin Appwrite Function (server-side).
// API keys and admin credentials must remain in Function environment variables.
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 2_000_000;
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
function cfg() {
    const endpoint = (
    process.env.APPWRITE_ENDPOINT ||
    'https://sfo.cloud.appwrite.io/v1'
    ).replace(/\/$/, '');

const c = {
    endpoint,
    project: process.env.APPWRITE_PROJECT_ID,
    key: process.env.APPWRITE_API_KEY,
    db: process.env.APPWRITE_DATABASE_ID,
    products: process.env.APPWRITE_PRODUCTS_TABLE_ID,
    finance: process.env.APPWRITE_FINANCE_TABLE_ID,
    analytics: process.env.APPWRITE_ANALYTICS_TABLE_ID,
    bucket: process.env.APPWRITE_PRODUCTS_BUCKET_ID
};

const missing = [];

if (!c.project) missing.push('APPWRITE_PROJECT_ID');
if (!c.key) missing.push('APPWRITE_API_KEY');
if (!c.db) missing.push('APPWRITE_DATABASE_ID');
if (!c.products) missing.push('APPWRITE_PRODUCTS_TABLE_ID');

if (missing.length) {
    throw new HttpError(
        500,
        `Faltan variables de entorno: ${missing.join(', ')}`
    );
}

return c;
}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);}
function parseBody(req){if(req.bodyJson&&typeof req.bodyJson==='object')return req.bodyJson;const raw=req.bodyText??req.body??'{}';if(typeof raw==='string'&&raw.length>MAX_BODY_BYTES)throw new HttpError(413,'Solicitud demasiado grande.');try{return JSON.parse(raw||'{}')}catch{throw new HttpError(400,'JSON inválido.');}}
function path(c,t,p=''){return `${c.endpoint}/tablesdb/${encodeURIComponent(c.db)}/tables/${encodeURIComponent(t)}/rows${p}`;}
async function request(c,t,p='',opts={}){if(!t)throw new HttpError(503,'Falta ID de tabla en variables de entorno.');const r=await fetch(path(c,t,p),{method:opts.method||'GET',headers:{'X-Appwrite-Project':c.project,'X-Appwrite-Key':c.key,'Content-Type':'application/json'},body:opts.body?JSON.stringify(opts.body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new HttpError(r.status,d.message||`Appwrite ${r.status}`);return d;}
async function allRows(c,t){const rows=[];let cursor;for(let i=0;i<20;i++){const qs=[{method:'limit',values:[100]}];if(cursor)qs.push({method:'cursorAfter',values:[cursor]});const q=qs.map(x=>'queries[]='+encodeURIComponent(JSON.stringify(x))).join('&');const d=await request(c,t,`?${q}`);const batch=d.rows||[];rows.push(...batch);if(batch.length<100)break;cursor=batch.at(-1).$id;}return rows;}
function parseKitItems(value){if(Array.isArray(value))return value;if(typeof value==='string'&&value.trim()){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}catch{}}return [];}
function rowData(row){const {$id,$createdAt,$updatedAt,...d}=row||{};if('kit_items'in d)d.kit_items=parseKitItems(d.kit_items);return {...d,id:$id,created_at:d.created_at||$createdAt,updated_at:d.updated_at||$updatedAt};}
function makeToken(){const secret=process.env.ADMIN_SESSION_SECRET;if(!secret)throw new HttpError(503,'Configura ADMIN_SESSION_SECRET.');const issued=Date.now();const payload=String(issued);const sig=createHmac('sha256',secret).update(payload).digest('hex');return `${payload}.${sig}`;}
function auth(body){const secret=process.env.ADMIN_SESSION_SECRET;const token=String(body.token||'');if(!secret)throw new HttpError(503,'Configura ADMIN_SESSION_SECRET.');const [issued,sig]=token.split('.');const payload=String(issued||'');const expected=createHmac('sha256',secret).update(payload).digest('hex');if(!/^\d+$/.test(payload)||Date.now()-Number(payload)>SESSION_TTL_MS||Number(payload)>Date.now()+60000||!safeEqual(sig,expected))throw new HttpError(401,'Sesión vencida o inválida.');}
async function uploadImage(c,image){if(!image||typeof image.data!=='string')return '';if(!c.bucket)throw new HttpError(503,'Configura APPWRITE_PRODUCTS_BUCKET_ID.');if(image.data.length>1_500_000)throw new HttpError(413,'Imagen demasiado grande.');const id=randomBytes(12).toString('hex');const blob=new Blob([Buffer.from(image.data,'base64')],{type:image.type||'image/jpeg'});const form=new FormData();form.append('file',blob,`product-${id}.jpg`);form.append('fileId',id);const r=await fetch(`${c.endpoint}/storage/buckets/${encodeURIComponent(c.bucket)}/files`,{method:'POST',headers:{'X-Appwrite-Project':c.project,'X-Appwrite-Key':c.key},body:form});const d=await r.json().catch(()=>({}));if(!r.ok)throw new HttpError(r.status,d.message||'No se pudo subir imagen.');return d.$id||id;}
async function action(c,a,d){switch(a){
case 'products.list':return {products:(await allRows(c,c.products)).map(rowData).sort((x,y)=>Number(x.sort_order||0)-Number(y.sort_order||0))};
case 'product.save':{const p=d.product||{};if(!String(p.name||'').trim())throw new HttpError(400,'Nombre requerido.');const image_path=p.image?await uploadImage(c,p.image):(p.image_path||'');const data={name:String(p.name).trim(),description:String(p.description||''),category:String(p.category||''),supplier:String(p.supplier||''),price:Number(p.price)||0,cost_price:Number(p.cost_price)||0,stock:Math.max(0,Math.trunc(Number(p.stock)||0)),is_active:p.is_active!==false,sort_order:Number(p.sort_order)||0,kit_items:JSON.stringify(Array.isArray(p.kit_items)?p.kit_items:[]),image_path};if(p.id){await request(c,c.products,`/${encodeURIComponent(p.id)}`,{method:'PUT',body:{data}});return {success:true,id:p.id};}const id=randomBytes(12).toString('hex');await request(c,c.products,'',{method:'POST',body:{rowId:id,data}});return {success:true,id};}
case 'product.visibility':{if(!d.id)throw new HttpError(400,'ID requerido.');await request(c,c.products,`/${encodeURIComponent(d.id)}`,{method:'PUT',body:{data:{is_active:Boolean(d.is_active)}}});return {success:true};}
case 'product.delete':{if(!d.id)throw new HttpError(400,'ID requerido.');await request(c,c.products,`/${encodeURIComponent(d.id)}`,{method:'DELETE'});return {success:true};}
case 'products.reorder':{if(!Array.isArray(d.ids)||d.ids.length>500)throw new HttpError(400,'Orden inválido.');await Promise.all(d.ids.map((id,i)=>request(c,c.products,`/${encodeURIComponent(id)}`,{method:'PUT',body:{data:{sort_order:i}}})));return {success:true};}
case 'finance.list':if(!c.finance)return {entries:[]};return {entries:(await allRows(c,c.finance)).map(rowData).sort((x,y)=>new Date(y.created_at)-new Date(x.created_at))};
case 'finance.save':{if(!c.finance)throw new HttpError(503,'Configura APPWRITE_FINANCE_TABLE_ID.');const e=d.entry||{};const data={kind:String(e.kind||''),created_at:String(e.created_at||new Date().toISOString()),description:String(e.description||''),product_id:String(e.product_id||''),product_name:String(e.product_name||''),category:String(e.category||''),supplier:String(e.supplier||''),quantity:Number(e.quantity)||0,unit_price:Number(e.unit_price)||0,amount:Number(e.amount)||0,analytics_event_id:String(e.analytics_event_id||'')};const id=randomBytes(12).toString('hex');await request(c,c.finance,'',{method:'POST',body:{rowId:id,data}});return {success:true,id};}
case 'finance.delete':if(!c.finance)throw new HttpError(503,'Configura APPWRITE_FINANCE_TABLE_ID.');await request(c,c.finance,`/${encodeURIComponent(d.id||'')}`,{method:'DELETE'});return {success:true};
case 'analytics.list':if(!c.analytics)return {events:[]};return {events:(await allRows(c,c.analytics)).map(rowData).sort((x,y)=>new Date(y.created_at)-new Date(x.created_at))};
case 'analytics.dismiss':if(!c.analytics)throw new HttpError(503,'Configura APPWRITE_ANALYTICS_TABLE_ID.');await request(c,c.analytics,`/${encodeURIComponent(d.id||'')}`,{method:'DELETE'});return {success:true};
default:throw new HttpError(404,'Acción no reconocida.');}}
export default async function adminHandler({req,res,log,error}){try{const c=cfg(),b=parseBody(req),a=String(b.action||'');if(a==='login'){const email=process.env.ADMIN_EMAIL,password=process.env.ADMIN_PASSWORD;if(!email||!password)throw new HttpError(503,'Configura ADMIN_EMAIL y ADMIN_PASSWORD en la Function.');if(!safeEqual(b.email,email)||!safeEqual(b.password,password))throw new HttpError(401,'Credenciales incorrectas.');const token=makeToken();return res.json({token});}auth(b);if(a==='session')return res.json({success:true});const result=await action(c,a,b);log?.(`Admin action: ${a}`);return res.json(result);}catch(e){error?.(e.message);return res.json({success:false,message:e.message||'Error'},e instanceof HttpError?e.status:500);}}
