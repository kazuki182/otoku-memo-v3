let supabaseClient = null;
let mode = 'local';
let products = [];
let prices = [];
let shoppingItems = [];

const $ = (id) => document.getElementById(id);
const yen = (n) => `${Math.round(Number(n)||0).toLocaleString()}円`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()));

const PRESET_STORES = [
  'イオン','イオンスタイル','まいばすけっと','マックスバリュ','イトーヨーカドー','ヨークフーズ','ヨークマート','西友','ライフ','サミット','オーケー','ベルク','ヤオコー','マルエツ','マルエツプチ','東武ストア','カスミ','フードスクエアカスミ','コモディイイダ','ロピア','業務スーパー','いなげや','Olympic','オリンピック',
  'ウエルシア','マツモトキヨシ','ココカラファイン','スギ薬局','サンドラッグ','クリエイトSD','ツルハドラッグ','セイムス','ドラッグコスモス','トモズ',
  'カインズ','ビバホーム','スーパービバホーム','島忠','島忠ホームズ','コーナン','ケーヨーデイツー','ドン・キホーテ','MEGAドンキ','コストコ'
];

function getUsedStores(){
  return [...new Set(prices.map(p => p.store_name).filter(Boolean))];
}

function getStoreCandidates(){
  const last = localStorage.getItem('lastStoreName');
  return [...new Set([last, ...getUsedStores(), ...PRESET_STORES].filter(Boolean))];
}


function readLocal(key){ try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
function writeLocal(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function setStatus(message, type=''){
  const el = $('appStatus');
  el.textContent = message;
  el.className = `notice small ${type}`.trim();
}

function escapeHtml(str){
  return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
}

function initSupabase(){
  const url = localStorage.getItem('supabaseUrl') || '';
  const key = localStorage.getItem('supabaseKey') || '';
  $('supabaseUrl').value = url;
  $('supabaseKey').value = key;

  if(url && key && window.supabase){
    supabaseClient = window.supabase.createClient(url, key);
    mode = 'supabase';
    $('configStatus').textContent = 'Supabase設定があります。接続して読み込みます。';
    return;
  }

  supabaseClient = null;
  mode = 'local';
  $('configStatus').textContent = 'Supabase未設定です。ブラウザ内保存で使います。';
}

async function loadAll(){
  if(mode === 'supabase' && supabaseClient){
    const p = await supabaseClient.from('products').select('*').order('created_at',{ascending:false});
    if(p.error){ fallbackToLocal('商品データの読み込みに失敗したため、ブラウザ内保存に切り替えました。'); return; }
    const pr = await supabaseClient.from('price_records').select('*, products(product_name)').order('created_at',{ascending:false});
    if(pr.error){ fallbackToLocal('価格データの読み込みに失敗したため、ブラウザ内保存に切り替えました。'); return; }
    const s = await supabaseClient.from('shopping_items').select('*').order('created_at',{ascending:false});
    if(s.error){ fallbackToLocal('買い物リストの読み込みに失敗したため、ブラウザ内保存に切り替えました。'); return; }
    products = p.data || [];
    prices = pr.data || [];
    shoppingItems = s.data || [];
    render();
    setStatus('Supabase接続OK。登録できます。','ok');
    return;
  }

  products = readLocal('otokuProducts');
  prices = readLocal('otokuPrices');
  shoppingItems = readLocal('otokuShoppingItems');
  render();
  setStatus('ブラウザ内保存モードです。商品・価格・買い物リストをこのまま使えます。','ok');
}

function fallbackToLocal(message){
  console.warn(message);
  mode = 'local';
  supabaseClient = null;
  products = readLocal('otokuProducts');
  prices = readLocal('otokuPrices');
  shoppingItems = readLocal('otokuShoppingItems');
  render();
  setStatus(message, 'error');
}

function saveLocalAll(){
  writeLocal('otokuProducts', products);
  writeLocal('otokuPrices', prices);
  writeLocal('otokuShoppingItems', shoppingItems);
}

function render(){
  $('productCount').textContent = `${products.length}件`;
  renderProducts();
  renderPriceSelect();
  renderShoppingProductSelect();
  renderStoreSuggestions();
  renderPrices();
  renderShopping();
  renderSavings();
}

function productPriceStats(productId){
  const rows = prices.filter(r => r.product_id === productId).map(r => ({...r, price:Number(r.price)||0})).filter(r => r.price > 0);
  if(!rows.length) return null;
  const latest = rows[0];
  const min = rows.reduce((a,b)=> a.price <= b.price ? a : b);
  const max = rows.reduce((a,b)=> a.price >= b.price ? a : b);
  const avg = rows.reduce((sum,r)=>sum+r.price,0)/rows.length;
  const stores = [...new Set(rows.map(r => r.store_name).filter(Boolean))];
  return { latest, min, max, avg, count: rows.length, stores };
}

function unitPriceText(product, price){
  const vol = Number(product.volume)||0;
  if(!vol || !price) return '';
  return `${(Number(price)/vol).toFixed(2)}円/${escapeHtml(product.unit || '単位')}`;
}

function renderProducts(){
  $('productList').innerHTML = products.map(p => {
    const st = productPriceStats(p.id);
    if(!st){
      return `<div class="product-card">
        <div class="product-head"><div><h3>${escapeHtml(p.product_name)}</h3><p class="small">${escapeHtml(p.category || '未分類')} / ${p.volume || '-'}${escapeHtml(p.unit || '')}</p></div><span class="badge pale">価格未登録</span></div>
        <div class="empty-price">価格が未登録です。下のボタンから価格だけ入力できます。</div>
        <button class="primary wide-btn" type="button" onclick="openQuickPrice('${p.id}')">価格を追加</button>
      </div>`;
    }
    const saved = Math.max(0, st.avg - st.latest.price);
    return `<div class="product-card">
      <div class="product-head">
        <div><h3>${escapeHtml(p.product_name)}</h3><p class="small">${escapeHtml(p.category || '未分類')} / ${p.volume || '-'}${escapeHtml(p.unit || '')}</p></div>
        <span class="badge">${st.count}件</span>
      </div>
      <div class="price-main">
        <div><span>最新価格</span><strong>${yen(st.latest.price)}</strong><small>${escapeHtml(st.latest.store_name || '店舗未入力')}</small></div>
        <div><span>最安値</span><strong>${yen(st.min.price)}</strong><small>${escapeHtml(st.min.store_name || '店舗未入力')}</small></div>
      </div>
      <div class="price-sub">
        <span>平均 ${yen(st.avg)}</span>
        <span>最高 ${yen(st.max.price)}</span>
        <span>${unitPriceText(p, st.latest.price) || '単価未設定'}</span>
      </div>
      <div class="stores-line">登録店舗：${escapeHtml(st.stores.join('、') || '未入力')}</div>
      <div class="saving-line">${saved > 0 ? `平均より ${yen(saved)} お得` : '平均価格以上です。次回の比較に使えます。'}</div>
      <button class="primary wide-btn" type="button" onclick="openQuickPrice('${p.id}')">この商品の価格を追加</button>
    </div>`;
  }).join('') || '<div class="card"><p class="small">まだ製品がありません。まず「製品登録」から、普段買う商品を追加してください。</p></div>';
}

function renderPriceSelect(){
  if(!products.length){
    $('priceProduct').innerHTML = '<option value="">先に商品を登録してください</option>';
    return;
  }
  $('priceProduct').innerHTML = products.map(p => `<option value="${p.id}">${escapeHtml(p.product_name)}</option>`).join('');
}

function renderShoppingProductSelect(){
  const el = $('shoppingProduct');
  if(!el) return;
  if(!products.length){
    el.innerHTML = '<option value="">先に商品・価格タブで商品を登録してください</option>';
    return;
  }
  el.innerHTML = products.map(p => {
    const st = productPriceStats(p.id);
    const priceLabel = st ? ` / 最新 ${yen(st.latest.price)}` : ' / 価格未登録';
    return `<option value="${p.id}">${escapeHtml(p.product_name)}${escapeHtml(priceLabel)}</option>`;
  }).join('');
}


function renderStoreSuggestions(){
  const datalist = $('storeSuggestions');
  if(datalist){
    datalist.innerHTML = getStoreCandidates().map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
  }
  const chips = $('storeChips');
  if(chips){
    const recent = getStoreCandidates().slice(0, 8);
    chips.innerHTML = recent.map(name => `<button class="chip" type="button" onclick="setStoreName('${escapeHtml(name).replace(/'/g,'&#039;')}')">${escapeHtml(name)}</button>`).join('');
  }
}

function setStoreName(name){
  $('storeName').value = name;
  $('priceValue').focus();
}
window.setStoreName = setStoreName;

function openQuickPrice(productId){
  document.querySelectorAll('.tab,.tab-panel').forEach(e => e.classList.remove('active'));
  document.querySelector('[data-tab="prices"]').classList.add('active');
  $('prices').classList.add('active');
  $('priceProduct').value = productId;
  const store = localStorage.getItem(`lastStoreFor_${productId}`) || localStorage.getItem('lastStoreName') || '';
  $('storeName').value = store;
  $('priceValue').value = '';
  $('priceValue').focus();
  const product = products.find(p => p.id === productId);
  setStatus(`${product?.product_name || '商品'}の価格を追加します。店舗候補を確認して、価格だけ入れてください。`, 'ok');
}
window.openQuickPrice = openQuickPrice;

function renderPrices(){
  $('priceList').innerHTML = prices.map(r => {
    const product = products.find(p => p.id === r.product_id);
    const name = r.products?.product_name || product?.product_name || '商品';
    return `<div class="item"><div><h3>${escapeHtml(name)}</h3><p class="small">${escapeHtml(r.store_name || '店舗未入力')} / ${new Date(r.created_at).toLocaleDateString()}</p></div><span class="badge">${yen(r.price)}</span></div>`;
  }).join('') || '<p class="small">まだ価格履歴がありません。</p>';
}

function renderShopping(){
  $('shoppingList').innerHTML = shoppingItems.map(i => {
    const product = products.find(p => p.id === i.product_id);
    const st = product ? productPriceStats(product.id) : null;
    const name = product?.product_name || i.item_name || '商品';
    const detail = product ? `${product.category || '未分類'} / ${product.volume || '-'}${product.unit || ''}` : '登録商品情報なし';
    const priceInfo = st ? `目安：最新 ${yen(st.latest.price)} / 最安 ${yen(st.min.price)}` : '価格未登録';
    return `
    <div class="item">
      <div><h3>${i.purchased ? '✅' : '□'} ${escapeHtml(name)}</h3><p class="small">数量：${escapeHtml(i.quantity || '1')}　${escapeHtml(detail)}<br>${escapeHtml(priceInfo)}</p></div>
      <button class="danger" type="button" onclick="togglePurchased('${i.id}', ${!i.purchased})">${i.purchased ? '未購入に戻す' : '買った'}</button>
    </div>`;
  }).join('') || '<p class="small">買い物リストは空です。登録済み商品を選んで追加してください。</p>';
}

function renderSavings(){
  let total = 0;
  const grouped = {};
  prices.forEach(r => {
    if(!r.product_id) return;
    if(!grouped[r.product_id]) grouped[r.product_id] = [];
    grouped[r.product_id].push(Number(r.price) || 0);
  });
  Object.values(grouped).forEach(arr => {
    if(arr.length < 2) return;
    const latest = arr[0];
    const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
    if(avg > latest) total += avg - latest;
  });
  $('monthlySavings').textContent = yen(total);
}

async function addProduct(){
  const product_name = $('productName').value.trim();
  if(!product_name){ alert('商品名を入力してください。'); return; }
  const item = { product_name, volume: Number($('productVolume').value) || null, unit: $('productUnit').value, category: $('productCategory').value.trim(), created_at: new Date().toISOString() };

  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('products').insert(item).select().single();
    if(res.error){ fallbackToLocal(`商品登録に失敗しました：${res.error.message}`); return; }
  } else {
    products.unshift({ id: uid(), ...item });
    saveLocalAll();
  }

  $('productName').value = '';
  $('productVolume').value = '';
  $('productCategory').value = '';
  setStatus('製品を追加しました。次に価格登録をしてください。','ok');
  await loadAll();
}

async function addShoppingByProduct(productId, qty='1'){
  const product = products.find(p => p.id === productId);
  qty = String(qty || '1').trim() || '1';
  if(!product){ alert('先に「商品・価格」タブで商品を登録してください。'); return; }

  const item = { product_id: product.id, item_name: product.product_name, quantity: qty, memo: '', purchased: false, created_at: new Date().toISOString() };

  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('shopping_items').insert(item).select().single();
    if(res.error){ fallbackToLocal(`買い物リスト追加に失敗しました：${res.error.message}`); return; }
  } else {
    shoppingItems.unshift({ id: uid(), ...item });
    saveLocalAll();
  }

  $('shoppingQty').value = '1';
  setStatus(`${product.product_name}を買い物リストに追加しました。`,'ok');
  await loadAll();
}

async function addShoppingByName(name, qty='1'){
  const keyword = String(name || '').trim();
  if(!keyword){ alert('商品名を指定してください。'); return; }
  const product = products.find(p => p.product_name === keyword) || products.find(p => p.product_name.includes(keyword) || keyword.includes(p.product_name));
  if(!product){ alert(`「${keyword}」は登録済み商品にありません。先に商品・価格タブで登録してください。`); return; }
  await addShoppingByProduct(product.id, qty);
}

async function addPrice(){
  const product_id = $('priceProduct').value;
  const price = Number($('priceValue').value);
  if(!product_id){ alert('先に「商品」タブで商品を登録してください。'); return; }
  if(!price){ alert('価格を入力してください。'); return; }
  const storeName = $('storeName').value.trim() || localStorage.getItem(`lastStoreFor_${product_id}`) || localStorage.getItem('lastStoreName') || '';
  const item = { product_id, store_name: storeName, price, created_at: new Date().toISOString() };

  if(storeName){
    localStorage.setItem('lastStoreName', storeName);
    localStorage.setItem(`lastStoreFor_${product_id}`, storeName);
  }

  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('price_records').insert(item).select().single();
    if(res.error){ fallbackToLocal(`価格登録に失敗しました：${res.error.message}`); return; }
  } else {
    prices.unshift({ id: uid(), ...item });
    saveLocalAll();
  }

  $('priceValue').value = '';
  setStatus('価格を登録しました。','ok');
  await loadAll();
}

async function togglePurchased(id, purchased){
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('shopping_items').update({purchased}).eq('id', id);
    if(res.error){ fallbackToLocal(`購入済み変更に失敗しました：${res.error.message}`); return; }
  } else {
    shoppingItems = shoppingItems.map(i => i.id === id ? {...i, purchased} : i);
    saveLocalAll();
  }
  await loadAll();
}
window.togglePurchased = togglePurchased;

function buildCompareResult(av, ap, bv, bp, unit='単位'){
  if(!av || !ap || !bv || !bp){ return null; }
  const au = ap / av;
  const bu = bp / bv;
  const winner = au < bu ? 'A' : 'B';
  const loser = winner === 'A' ? 'B' : 'A';
  const diff = Math.abs(au - bu);
  const cheaperUnit = Math.min(au, bu);
  const expensiveUnit = Math.max(au, bu);
  const savingRate = expensiveUnit ? ((expensiveUnit - cheaperUnit) / expensiveUnit * 100) : 0;
  const aEquivalent = au * bv;
  const bEquivalent = bu * av;
  const extra = winner === 'A'
    ? `Bの容量${bv}${unit}分をA単価で買うと約${yen(aEquivalent)}です。`
    : `Aの容量${av}${unit}分をB単価で買うと約${yen(bEquivalent)}です。`;
  return `<strong>${winner}の方がお得です。</strong><br>
    A：1${escapeHtml(unit)}あたり ${au.toFixed(3)}円<br>
    B：1${escapeHtml(unit)}あたり ${bu.toFixed(3)}円<br>
    差額：1${escapeHtml(unit)}あたり ${diff.toFixed(3)}円<br>
    ${loser}より約${savingRate.toFixed(1)}%安いです。<br>
    <span class="small">${extra}</span>`;
}

function compare(){
  const av = Number($('aVolume').value), ap = Number($('aPrice').value), bv = Number($('bVolume').value), bp = Number($('bPrice').value);
  const html = buildCompareResult(av, ap, bv, bp, '単位');
  if(!html){ alert('容量と価格をすべて入力してください。'); return; }
  $('compareResult').innerHTML = html;
}

function quickCompare(){
  const av = Number($('qAVolume').value), ap = Number($('qAPrice').value), bv = Number($('qBVolume').value), bp = Number($('qBPrice').value);
  const unit = $('qUnit').value || '単位';
  const html = buildCompareResult(av, ap, bv, bp, unit);
  if(!html){ alert('容量と価格をすべて入力してください。'); return; }
  $('quickCompareResult').classList.remove('hidden');
  $('quickCompareResult').innerHTML = html;
}

function clearQuickCompare(){
  ['qAVolume','qAPrice','qBVolume','qBPrice'].forEach(id => $(id).value = '');
  $('quickCompareResult').innerHTML = '';
  $('quickCompareResult').classList.add('hidden');
}

function voice(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){ alert('このブラウザは音声認識に対応していません。Chromeでお試しください。'); return; }
  const rec = new SpeechRecognition();
  rec.lang = 'ja-JP';
  rec.interimResults = false;
  rec.onresult = async (e) => {
    const text = e.results[0][0].transcript;
    $('voiceText').textContent = `認識: ${text}`;
    const clean = text.replace(/を追加|追加して|買う|買いたい/g,'');
    const parts = clean.split(/、|,|と|あと/g).map(s => s.trim()).filter(Boolean);
    for(const name of parts){ await addShoppingByName(name); }
  };
  rec.start();
}

function setupEvents(){
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab,.tab-panel').forEach(e => e.classList.remove('active'));
    btn.classList.add('active');
    $(btn.dataset.tab).classList.add('active');
  }));

  $('settingsBtn').addEventListener('click', () => $('configPanel').classList.toggle('hidden'));
  $('saveConfigBtn').addEventListener('click', async () => {
    localStorage.setItem('supabaseUrl', $('supabaseUrl').value.trim());
    localStorage.setItem('supabaseKey', $('supabaseKey').value.trim());
    initSupabase();
    await loadAll();
  });
  $('clearConfigBtn').addEventListener('click', async () => {
    localStorage.removeItem('supabaseUrl');
    localStorage.removeItem('supabaseKey');
    initSupabase();
    await loadAll();
  });
  $('addProductBtn').addEventListener('click', addProduct);
  $('addShoppingBtn').addEventListener('click', () => addShoppingByProduct($('shoppingProduct').value, $('shoppingQty').value));
  $('addPriceBtn').addEventListener('click', addPrice);
  $('compareBtn').addEventListener('click', compare);
  $('quickCompareBtn').addEventListener('click', quickCompare);
  $('quickCompareClearBtn').addEventListener('click', clearQuickCompare);
  $('voiceBtn').addEventListener('click', voice);
}

setupEvents();
initSupabase();
loadAll();
