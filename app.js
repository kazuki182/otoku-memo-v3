let supabaseClient = null;
let products = [];
let prices = [];
let shoppingItems = [];

const $ = (id) => document.getElementById(id);
const yen = (n) => `${Math.round(Number(n)||0).toLocaleString()}円`;

function initSupabase(){
  const url = localStorage.getItem('supabaseUrl') || '';
  const key = localStorage.getItem('supabaseKey') || '';
  $('supabaseUrl').value = url;
  $('supabaseKey').value = key;
  if(url && key && window.supabase){
    supabaseClient = window.supabase.createClient(url, key);
    $('configStatus').textContent = 'Supabaseに接続設定済みです。';
    return true;
  }
  $('configPanel').classList.remove('hidden');
  return false;
}

async function loadAll(){
  if(!supabaseClient) return;
  const p = await supabaseClient.from('products').select('*').order('created_at',{ascending:false});
  const pr = await supabaseClient.from('price_records').select('*, products(product_name)').order('created_at',{ascending:false});
  const s = await supabaseClient.from('shopping_items').select('*').order('created_at',{ascending:false});
  products = p.data || [];
  prices = pr.data || [];
  shoppingItems = s.data || [];
  render();
}

function render(){
  $('productCount').textContent = `${products.length}件`;
  renderProducts(); renderPriceSelect(); renderPrices(); renderShopping(); renderSavings();
}

function renderProducts(){
  $('productList').innerHTML = products.map(p=>`
    <div class="item"><div><h3>${escapeHtml(p.product_name)}</h3><p class="small">${p.category||'未分類'} / ${p.volume||''}${p.unit||''}</p></div><span class="badge">商品</span></div>`).join('') || '<p class="small">まだ商品がありません。</p>';
}

function renderPriceSelect(){
  $('priceProduct').innerHTML = products.map(p=>`<option value="${p.id}">${escapeHtml(p.product_name)}</option>`).join('');
}

function renderPrices(){
  $('priceList').innerHTML = prices.map(r=>`
    <div class="item"><div><h3>${escapeHtml(r.products?.product_name || '商品')}</h3><p class="small">${escapeHtml(r.store_name||'店舗未入力')} / ${new Date(r.created_at).toLocaleDateString()}</p></div><span class="badge">${yen(r.price)}</span></div>`).join('') || '<p class="small">まだ価格履歴がありません。</p>';
}

function renderShopping(){
  $('shoppingList').innerHTML = shoppingItems.map(i=>`
    <div class="item"><div><h3>${i.purchased?'✅':'□'} ${escapeHtml(i.item_name)}</h3><p class="small">${escapeHtml(i.quantity||'')} ${escapeHtml(i.memo||'')}</p></div><button class="danger" onclick="togglePurchased('${i.id}',${!i.purchased})">${i.purchased?'戻す':'買った'}</button></div>`).join('') || '<p class="small">買い物リストは空です。</p>';
}

function renderSavings(){
  let total = 0;
  const byProduct = {};
  prices.forEach(r=>{ if(!byProduct[r.product_id]) byProduct[r.product_id]=[]; byProduct[r.product_id].push(Number(r.price)||0); });
  Object.values(byProduct).forEach(arr=>{
    if(arr.length < 2) return;
    const latest = arr[0];
    const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
    if(avg > latest) total += avg-latest;
  });
  $('monthlySavings').textContent = yen(total);
}

async function addProduct(){
  if(!supabaseClient) return alert('先にSupabase設定を保存してください。');
  const product_name = $('productName').value.trim(); if(!product_name) return alert('商品名を入力してください。');
  await supabaseClient.from('products').insert({product_name, volume: Number($('productVolume').value)||null, unit:$('productUnit').value, category:$('productCategory').value.trim()});
  $('productName').value=''; $('productVolume').value=''; $('productCategory').value=''; await loadAll();
}

async function addPrice(){
  if(!supabaseClient) return alert('先にSupabase設定を保存してください。');
  const product_id = $('priceProduct').value; const price = Number($('priceValue').value); if(!product_id || !price) return alert('商品と価格を入力してください。');
  await supabaseClient.from('price_records').insert({product_id, store_name:$('storeName').value.trim(), price});
  $('priceValue').value=''; await loadAll();
}

async function addShopping(name, qty='', memo=''){
  if(!supabaseClient) return alert('先にSupabase設定を保存してください。');
  if(!name) return alert('商品名を入力してください。');
  await supabaseClient.from('shopping_items').insert({item_name:name, quantity:qty, memo});
  $('shoppingName').value=''; $('shoppingQty').value=''; $('shoppingMemo').value=''; await loadAll();
}

async function togglePurchased(id, purchased){
  await supabaseClient.from('shopping_items').update({purchased}).eq('id', id); await loadAll();
}
window.togglePurchased = togglePurchased;

function compare(){
  const av=Number($('aVolume').value), ap=Number($('aPrice').value), bv=Number($('bVolume').value), bp=Number($('bPrice').value);
  if(!av||!ap||!bv||!bp) return alert('容量と価格をすべて入力してください。');
  const au=ap/av, bu=bp/bv;
  const winner = au < bu ? 'A' : 'B';
  const diff = Math.abs(au-bu);
  $('compareResult').innerHTML = `${winner}の方がお得です。<br>A: 1単位あたり${au.toFixed(3)}円<br>B: 1単位あたり${bu.toFixed(3)}円<br>差額: 1単位あたり${diff.toFixed(3)}円`;
}

function voice(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition) return alert('このブラウザは音声認識に対応していません。Chromeでお試しください。');
  const rec = new SpeechRecognition(); rec.lang='ja-JP'; rec.interimResults=false;
  rec.onresult = (e)=>{
    const text = e.results[0][0].transcript; $('voiceText').textContent = `認識: ${text}`;
    const clean = text.replace(/を追加|追加して|買う|買いたい/g,'');
    const parts = clean.split(/、|,|と|あと/g).map(s=>s.trim()).filter(Boolean);
    parts.forEach(name=>addShopping(name));
  };
  rec.start();
}

function escapeHtml(str){ return String(str||'').replace(/[&<>"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[s])); }

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab,.tab-panel').forEach(e=>e.classList.remove('active'));btn.classList.add('active');$(btn.dataset.tab).classList.add('active');}));
$('settingsBtn').onclick=()=>$('configPanel').classList.toggle('hidden');
$('saveConfigBtn').onclick=()=>{localStorage.setItem('supabaseUrl',$('supabaseUrl').value.trim());localStorage.setItem('supabaseKey',$('supabaseKey').value.trim());initSupabase();loadAll();};
$('addProductBtn').onclick=addProduct;
$('addPriceBtn').onclick=addPrice;
$('addShoppingBtn').onclick=()=>addShopping($('shoppingName').value.trim(), $('shoppingQty').value.trim(), $('shoppingMemo').value.trim());
$('compareBtn').onclick=compare;
$('voiceBtn').onclick=voice;

if(initSupabase()) loadAll();
