let supabaseClient = null;
let mode = 'local';
const DEFAULT_SUPABASE_URL = 'https://fbsghhnwfxzmiwpllyfr.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_yjY4AVr03Jpl9C7LpFxNlw_wYMjGE-n';
let products = [];
let prices = [];
let shoppingItems = [];
let approvedAccounts = ['kazuki','Yoshino'];
let supportConfig = { paypay_id: '', paypay_url: '', message: '無料で便利に使えるアプリを目指しています。応援いただけると開発継続の励みになります。' };
let currentAccount = localStorage.getItem('currentAccount') || '';
let pendingProductImageData = '';
const FIXED_LOGIN_PASSWORD = '12345';

const $ = (id) => document.getElementById(id);
const yen = (n) => `${Math.round(Number(n)||0).toLocaleString()}円`;
const formatDate = (value) => {
  const d = value ? new Date(value) : new Date();
  if(Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
};
const todayDateInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const dateInputToIso = (value) => {
  if(!value) return new Date().toISOString();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()));

function getFamilyCode(){
  return (localStorage.getItem('familyCode') || 'default').trim() || 'default';
}

function getMemberName(){
  return (localStorage.getItem('memberName') || currentAccount || '').trim() || '未設定';
}

function shoppingStorageKey(){
  return `otokuShoppingItems_${getFamilyCode()}`;
}

function migrateOldShoppingLocal(){
  const old = readLocal('otokuShoppingItems');
  const key = shoppingStorageKey();
  if(old.length && !localStorage.getItem(key)){
    writeLocal(key, old.map(i => ({...i, family_code: getFamilyCode()})));
  }
}


function approvedStorageKey(){ return 'otokuApprovedAccounts'; }
function readApprovedLocal(){
  const saved = readLocal(approvedStorageKey()).map(v => String(v).trim()).filter(Boolean);
  return [...new Set(['kazuki', ...saved])];
}
function writeApprovedLocal(list){
  writeLocal(approvedStorageKey(), [...new Set(['kazuki', ...list.map(v => String(v).trim()).filter(Boolean)])]);
}

function defaultSupportConfig(){
  return { paypay_id: '', paypay_url: '', message: '無料で便利に使えるアプリを目指しています。応援いただけると開発継続の励みになります。' };
}
function readSupportLocal(){
  try { return {...defaultSupportConfig(), ...(JSON.parse(localStorage.getItem('otokuSupportConfig') || '{}') || {})}; }
  catch { return defaultSupportConfig(); }
}
function writeSupportLocal(cfg){
  localStorage.setItem('otokuSupportConfig', JSON.stringify({...defaultSupportConfig(), ...cfg}));
}
async function loadSupportConfig(){
  supportConfig = readSupportLocal();
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('support_settings').select('*').eq('id', 'default').maybeSingle();
    if(!res.error && res.data){
      supportConfig = {...defaultSupportConfig(), ...res.data};
      writeSupportLocal(supportConfig);
    }
  }
  renderSupport();
}
async function saveSupportConfig(){
  if(currentAccount !== 'kazuki'){
    alert('応援ページの編集は管理者 kazuki のみ可能です。');
    return;
  }
  const cfg = {
    id: 'default',
    paypay_id: ($('supportPaypayId')?.value || '').trim(),
    paypay_url: ($('supportPaypayUrl')?.value || '').trim(),
    message: ($('supportMessage')?.value || '').trim() || defaultSupportConfig().message,
    updated_by: currentAccount,
    updated_at: new Date().toISOString()
  };
  supportConfig = {...defaultSupportConfig(), ...cfg};
  writeSupportLocal(supportConfig);
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('support_settings').upsert(cfg, {onConflict:'id'});
    if(res.error){
      if($('supportStatus')) $('supportStatus').textContent = `クラウド保存に失敗しました：${res.error.message}。この端末には保存しました。`;
      setStatus('応援ページ設定のクラウド保存に失敗しました。Supabaseでschema.sqlを再実行してください。','error');
    } else {
      if($('supportStatus')) $('supportStatus').textContent = '応援ページを保存しました。';
      setStatus('応援ページを保存しました。','ok');
    }
  } else {
    if($('supportStatus')) $('supportStatus').textContent = 'この端末に保存しました。';
    setStatus('応援ページをこの端末に保存しました。','ok');
  }
  renderSupport();
}
function resetSupportConfig(){
  if($('supportPaypayId')) $('supportPaypayId').value = '';
  if($('supportPaypayUrl')) $('supportPaypayUrl').value = '';
  if($('supportMessage')) $('supportMessage').value = defaultSupportConfig().message;
}
function renderSupport(){
  const cfg = {...defaultSupportConfig(), ...supportConfig};
  const box = $('supportDisplay');
  if(box){
    const hasId = !!cfg.paypay_id;
    const hasUrl = !!cfg.paypay_url;
    box.innerHTML = `
      <div class="support-message">${escapeHtml(cfg.message).replace(/\n/g,'<br>')}</div>
      <div class="support-paypay-card">
        <div>
          <p class="eyebrow mini">PayPayで応援</p>
          <h3>${hasId ? escapeHtml(cfg.paypay_id) : '送金先は準備中です'}</h3>
          <p class="small">PayPay公式API連携ではありません。無料運用のため、送金先表示・コピー・外部リンクのみの簡易方式です。</p>
        </div>
        <div class="button-row">
          <button class="primary" type="button" onclick="copySupportPaypay()" ${hasId ? '' : 'disabled'}>送金先をコピー</button>
          <button class="ghost" type="button" onclick="openSupportPaypay()" ${hasUrl ? '' : 'disabled'}>PayPay関連リンクを開く</button>
        </div>
      </div>
      <div class="support-note small">投げ銭は完全任意です。アプリ機能は無料で使えます。</div>`;
  }
  if($('supportAdminBox')) $('supportAdminBox').classList.toggle('hidden', currentAccount !== 'kazuki');
  if($('supportPaypayId')) $('supportPaypayId').value = cfg.paypay_id || '';
  if($('supportPaypayUrl')) $('supportPaypayUrl').value = cfg.paypay_url || '';
  if($('supportMessage')) $('supportMessage').value = cfg.message || '';
}
async function copySupportPaypay(){
  const v = (supportConfig.paypay_id || '').trim();
  if(!v){ alert('送金先が未設定です。'); return; }
  try{ await navigator.clipboard.writeText(v); alert('送金先をコピーしました。'); }
  catch{ prompt('送金先をコピーしてください。', v); }
}
function openSupportPaypay(){
  const url = (supportConfig.paypay_url || '').trim();
  if(!url){ alert('リンクが未設定です。'); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
}
window.copySupportPaypay = copySupportPaypay;
window.openSupportPaypay = openSupportPaypay;
async function loadApprovedAccounts(){
  approvedAccounts = readApprovedLocal();
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('approved_accounts').select('*').order('created_at',{ascending:true});
    if(!res.error && Array.isArray(res.data)){
      approvedAccounts = [...new Set(['kazuki', ...res.data.map(r => r.account_name).filter(Boolean)])];
      writeApprovedLocal(approvedAccounts);
    }
  }
  renderApprovedAccounts();
  return approvedAccounts;
}
function isApprovedAccount(name){
  const n = String(name || '').trim().toLowerCase();
  return approvedAccounts.map(v => String(v).trim().toLowerCase()).includes(n);
}
function showLoginGate(){
  const gate = $('loginGate');
  const shell = document.querySelector('.app-shell');
  if(!gate || !shell) return;
  const loggedIn = Boolean(currentAccount && isApprovedAccount(currentAccount));
  document.body.classList.toggle('auth-unlocked', loggedIn);
  document.body.classList.toggle('auth-locked', !loggedIn);
  if(loggedIn){
    gate.classList.add('hidden');
    gate.setAttribute('aria-hidden','true');
    shell.classList.remove('locked');
    shell.removeAttribute('aria-hidden');
  }else{
    gate.classList.remove('hidden');
    gate.removeAttribute('aria-hidden');
    shell.classList.add('locked');
    shell.setAttribute('aria-hidden','true');
  }
  updateAccountUi();
}
function updateAccountUi(){
  if($('currentAccountName')) $('currentAccountName').textContent = currentAccount || '未ログイン';
  if($('memberName') && currentAccount && !$('memberName').value) $('memberName').value = getMemberName() === '未設定' ? currentAccount : getMemberName();
  if($('adminApprovalBox')) $('adminApprovalBox').classList.toggle('hidden', currentAccount !== 'kazuki');
  renderApprovedAccounts();
}
async function login(){
  const account = ($('loginAccount')?.value || '').trim();
  const pass = ($('loginPassword')?.value || '').trim();
  if(!account){ $('loginStatus').textContent = 'アカウント名を入力してください。'; return; }
  if(pass !== FIXED_LOGIN_PASSWORD){ $('loginStatus').textContent = 'パスワードが違います。'; return; }
  await loadApprovedAccounts();
  if(!isApprovedAccount(account)){
    $('loginStatus').textContent = 'このアカウントはまだ承認されていません。管理者 kazuki で承認してください。';
    return;
  }
  currentAccount = account;
  localStorage.setItem('currentAccount', currentAccount);
  if(!localStorage.getItem('memberName')) localStorage.setItem('memberName', currentAccount);
  $('loginStatus').textContent = '';
  showLoginGate();
  render();
  setTimeout(() => window.scrollTo({top:0, behavior:'smooth'}), 50);
}
function logout(){
  currentAccount = '';
  localStorage.removeItem('currentAccount');
  showLoginGate();
}
async function addApprovedAccount(){
  if(currentAccount !== 'kazuki'){ alert('承認操作は管理者 kazuki のみ可能です。'); return; }
  const name = ($('approvedAccountInput')?.value || '').trim();
  if(!name){ alert('承認するアカウント名を入力してください。'); return; }
  const next = [...new Set([...approvedAccounts, name])];
  approvedAccounts = next;
  writeApprovedLocal(next);
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('approved_accounts').upsert({account_name:name, created_by: currentAccount}, {onConflict:'account_name'});
    if(res.error){ setStatus(`承認リストのクラウド保存に失敗しました：${res.error.message}。この端末には保存しました。`, 'error'); }
    else setStatus(`${name} を承認しました。`, 'ok');
  }else{
    setStatus(`${name} をこの端末で承認しました。Supabase設定後に再度承認すると家族端末にも共有しやすくなります。`, 'ok');
  }
  $('approvedAccountInput').value = '';
  renderApprovedAccounts();
}
async function removeApprovedAccount(name){
  if(currentAccount !== 'kazuki'){ alert('承認解除は管理者 kazuki のみ可能です。'); return; }
  if(name === 'kazuki'){ alert('kazuki は解除できません。'); return; }
  if(!confirm(`${name} の承認を解除しますか？`)) return;
  approvedAccounts = approvedAccounts.filter(v => v !== name);
  writeApprovedLocal(approvedAccounts);
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('approved_accounts').delete().eq('account_name', name);
    if(res.error){ setStatus(`承認解除のクラウド保存に失敗しました：${res.error.message}`, 'error'); }
    else setStatus(`${name} の承認を解除しました。`, 'ok');
  }
  renderApprovedAccounts();
}
window.removeApprovedAccount = removeApprovedAccount;

function renderApprovedAccounts(){
  const box = $('approvedAccountList');
  if(!box) return;
  const list = [...new Set(['kazuki', ...approvedAccounts])];
  box.innerHTML = list.map(name => `<span class="approved-pill">${escapeHtml(name)}${name !== 'kazuki' && currentAccount === 'kazuki' ? ` <button class="pill-x" type="button" onclick="removeApprovedAccount('${escapeHtml(name).replace(/'/g,'&#039;')}')">×</button>` : ''}</span>`).join('');
}


const PRESET_STORES = [
  'イオン','イオンスタイル','まいばすけっと','マックスバリュ','イトーヨーカドー','ヨークフーズ','ヨークマート','ヨークプライス','西友','ライフ','サミット','オーケー','ベルク','ベルクス','ヤオコー','マルエツ','マルエツプチ','東武ストア','カスミ','フードスクエアカスミ','コモディイイダ','ロピア','業務スーパー','いなげや','Olympic','オリンピック','ベイシア','マミーマート','ジャパンミート','ミートミート','ジョイフード','ダイレックス','アコレ','ビッグ・エー','成城石井','コープみらい','マルヤ','マルサン',
  'ウエルシア','マツモトキヨシ','ココカラファイン','スギ薬局','サンドラッグ','クリエイトSD','ツルハドラッグ','セイムス','ドラッグコスモス','トモズ','ドラッグストアセキ','マツモトキヨシ薬局',
  'カインズ','ビバホーム','スーパービバホーム','島忠','島忠ホームズ','コーナン','ケーヨーデイツー','ドン・キホーテ','MEGAドンキ','コストコ'
];

const STATION_SUGGESTIONS = ['川口','川口元郷','東川口','西川口','蕨','戸田','戸田公園','北戸田','浦和','北浦和','南浦和','東浦和','武蔵浦和','中浦和','大宮','さいたま新都心','与野','与野本町','北与野','草加','谷塚','獨協大学前','新田','越谷','北越谷','南越谷','新越谷','せんげん台','春日部','所沢','新所沢','小手指','川越','本川越','川越市','和光市','朝霞','朝霞台','北朝霞','志木','ふじみ野','上福岡','池袋','新宿','渋谷','上野','日暮里','北千住','赤羽','王子','板橋','亀有','金町','綾瀬','葛西','西葛西','船橋','西船橋','東船橋','市川','本八幡','下総中山','松戸','新松戸','北松戸','柏','南柏','北柏','流山おおたかの森','南流山','津田沼','新津田沼','千葉','蘇我','稲毛','幕張本郷'];

const COMMON_PRODUCTS = [
  '牛乳','卵','食パン','米','水','お茶','コーヒー','ヨーグルト','納豆','豆腐','醤油','みりん','料理酒','サラダ油','オリーブオイル','マヨネーズ','ケチャップ',
  'トイレットペーパー','ティッシュ','キッチンペーパー','ゴミ袋','ラップ','アルミホイル','食器用洗剤','洗濯洗剤','柔軟剤','漂白剤','消臭剤','掃除シート',
  'シャンプー','コンディショナー','ボディソープ','ハンドソープ','歯磨き粉','歯ブラシ','マスク','おむつ','おしりふき','ペットフード','ペットシート'
];

const CATEGORIES = ['食品','飲料','日用品','衛生用品','ベビー用品','ペット用品','その他'];

const PRODUCT_TEMPLATES = [
  {name:'牛乳', category:'食品', volume:1000, unit:'ml'},
  {name:'卵', category:'食品', volume:10, unit:'個'},
  {name:'食パン', category:'食品', volume:1, unit:'個'},
  {name:'米', category:'食品', volume:5, unit:'kg'},
  {name:'水', category:'飲料', volume:2000, unit:'ml'},
  {name:'お茶', category:'飲料', volume:2000, unit:'ml'},
  {name:'洗濯洗剤', category:'日用品', volume:1, unit:'個'},
  {name:'柔軟剤', category:'日用品', volume:1, unit:'個'},
  {name:'ティッシュ', category:'日用品', volume:5, unit:'個'},
  {name:'トイレットペーパー', category:'日用品', volume:12, unit:'ロール'},
  {name:'シャンプー', category:'衛生用品', volume:1, unit:'個'},
  {name:'歯磨き粉', category:'衛生用品', volume:1, unit:'個'}
];

const VOLUME_PRESETS = [
  {label:'500ml', volume:500, unit:'ml'}, {label:'750ml', volume:750, unit:'ml'}, {label:'1L', volume:1, unit:'L'}, {label:'2L', volume:2, unit:'L'},
  {label:'300g', volume:300, unit:'g'}, {label:'500g', volume:500, unit:'g'}, {label:'1kg', volume:1, unit:'kg'}, {label:'5kg', volume:5, unit:'kg'},
  {label:'5箱', volume:5, unit:'個'}, {label:'12ロール', volume:12, unit:'ロール'}, {label:'18ロール', volume:18, unit:'ロール'}
];

const PRICE_PRESETS = [98,128,158,178,198,228,248,278,298,328,348,378,398,448,498,548,598,698,798,980,1280,1580];

function getUsedStores(){
  return [...new Set(prices.map(p => p.store_name).filter(Boolean))];
}

function getNearestStation(){
  return (localStorage.getItem('nearestStation') || '').trim();
}
function getNearestStationInputValue(){
  const typed = ($('nearestStation')?.value || '').trim();
  return typed || getNearestStation();
}
function normalizeStationKeyword(value){
  return String(value || '').replace(/[\s　駅]/g,'').toLowerCase();
}
function getStationHistory(){
  try{ return JSON.parse(localStorage.getItem('stationHistory') || '[]'); }catch(e){ return []; }
}
function rememberStation(name){
  const clean = String(name || '').trim();
  if(!clean) return;
  const current = getStationHistory();
  localStorage.setItem('stationHistory', JSON.stringify([clean, ...current.filter(v => v !== clean)].slice(0, 20)));
}
function getStationCandidates(query=''){
  const saved = getNearestStation();
  const all = [...new Set([saved, ...getStationHistory(), ...STATION_SUGGESTIONS].filter(Boolean))];
  const q = normalizeStationKeyword(query);
  const list = q ? all.filter(name => normalizeStationKeyword(name).includes(q) || q.includes(normalizeStationKeyword(name))) : all;
  return list.slice(0, 18);
}
function setNearestStation(name){
  if($('nearestStation')) $('nearestStation').value = name;
  renderStationAssist();
  renderStoreSuggestions();
}
window.setNearestStation = setNearestStation;
function getChatgptLink(){
  return (localStorage.getItem('chatgptLink') || '').trim();
}
function stationBranchCandidates(){
  const station = getNearestStationInputValue();
  const basic = ['駅前店','駅東口店','駅西口店','駅前通り店','店'];
  const defaults = ['川口店','大宮店','浦和店','越谷店','草加店','所沢店','池袋店','新宿店','北千住店','船橋店','柏店','松戸店'];
  const stationOnes = station ? basic.map(suffix => `${station}${suffix}`) : [];
  const used = prices.map(p => extractBranchName(p.store_name)).filter(Boolean);
  return [...new Set([...used, ...stationOnes, ...defaults])];
}
function getStoreCandidates(){
  const last = localStorage.getItem('lastStoreName');
  const usedBase = getUsedStores().map(s => splitStoreName(s).base).filter(Boolean);
  // 表記ゆれを減らすため、チェーン名候補を優先して出す
  return [...new Set([last ? splitStoreName(last).base : '', ...usedBase, ...PRESET_STORES].filter(Boolean))];
}

function getProductNameCandidates(){
  const registered = products.map(p => p.product_name).filter(Boolean);
  const recent = JSON.parse(localStorage.getItem('recentProductNames') || '[]');
  return [...new Set([...registered, ...recent, ...PRODUCT_TEMPLATES.map(t=>t.name), ...COMMON_PRODUCTS].filter(Boolean))];
}

function rememberProductName(name){
  const current = JSON.parse(localStorage.getItem('recentProductNames') || '[]');
  localStorage.setItem('recentProductNames', JSON.stringify([name, ...current.filter(v => v !== name)].slice(0, 30)));
}


function guessProductAssist(name){
  const v = String(name || '').toLowerCase();
  const has = (...words) => words.some(w => v.includes(String(w).toLowerCase()));
  if(has('牛乳','ヨーグルト','卵','食パン','米','納豆','豆腐','醤油','みりん','油','マヨネーズ','ケチャップ')) return {category:'食品'};
  if(has('水','お茶','コーヒー','ジュース','飲料')) return {category:'飲料'};
  if(has('洗剤','柔軟剤','ティッシュ','トイレット','キッチンペーパー','ゴミ袋','ラップ','漂白','掃除')) return {category:'日用品'};
  if(has('シャンプー','コンディショナー','ボディソープ','歯磨き','歯ブラシ','マスク','ハンドソープ')) return {category:'衛生用品'};
  if(has('おむつ','おしりふき')) return {category:'ベビー用品'};
  if(has('ペット')) return {category:'ペット用品'};
  return {};
}

function applyProductTemplate(name){
  const t = PRODUCT_TEMPLATES.find(x => x.name === name);
  if(!t) return;
  $('productName').value = t.name;
  $('productCategory').value = t.category;
  $('productVolume').value = t.volume;
  setUnitIfExists(t.unit);
  $('productName').focus();
}
window.applyProductTemplate = applyProductTemplate;

function applyVolumePreset(volume, unit){
  $('productVolume').value = volume;
  setUnitIfExists(unit);
}
window.applyVolumePreset = applyVolumePreset;

function applyCategory(category){
  $('productCategory').value = category;
}
window.applyCategory = applyCategory;

function applyPricePreset(price){
  $('priceValue').value = price;
  $('priceValue').focus();
}
window.applyPricePreset = applyPricePreset;

function renderManualAssist(){
  const catList = $('categorySuggestions');
  if(catList) catList.innerHTML = CATEGORIES.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');

  const productChips = $('productQuickChips');
  if(productChips){
    const registered = products.slice(0, 6).map(p => p.product_name);
    const base = [...new Set([...registered, ...PRODUCT_TEMPLATES.map(t => t.name)])].slice(0, 14);
    productChips.innerHTML = base.map(name => `<button class="chip assist-chip" type="button" onclick="applyProductTemplate('${escapeHtml(name).replace(/'/g,'&#039;')}')">${escapeHtml(name)}</button>`).join('');
  }

  const volumeChips = $('volumeChips');
  if(volumeChips){
    volumeChips.innerHTML = VOLUME_PRESETS.map(v => `<button class="chip assist-chip" type="button" onclick="applyVolumePreset('${v.volume}','${escapeHtml(v.unit).replace(/'/g,'&#039;')}')">${escapeHtml(v.label)}</button>`).join('');
  }

  const categoryChips = $('categoryChips');
  if(categoryChips){
    categoryChips.innerHTML = CATEGORIES.map(c => `<button class="chip assist-chip" type="button" onclick="applyCategory('${escapeHtml(c).replace(/'/g,'&#039;')}')">${escapeHtml(c)}</button>`).join('');
  }

  const priceChips = $('priceChips');
  if(priceChips){
    priceChips.innerHTML = PRICE_PRESETS.map(v => `<button class="chip price-chip" type="button" onclick="applyPricePreset(${v})">${v}円</button>`).join('');
  }
}

function autoAssistProductFields(){
  const name = $('productName')?.value || '';
  const guessed = guessProductAssist(name);
  if(guessed.category && !$('productCategory').value) $('productCategory').value = guessed.category;
  const t = PRODUCT_TEMPLATES.find(x => x.name === name || name.includes(x.name));
  if(t){
    if(!$('productCategory').value) $('productCategory').value = t.category;
    if(!$('productVolume').value) $('productVolume').value = t.volume;
    if(t.unit) setUnitIfExists(t.unit);
  }
}


function readLocal(key){ try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
function writeLocal(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function setProductImagePreview(data){
  const box = $('productImagePreview');
  if(!box) return;
  if(data){
    box.classList.remove('hidden');
    box.innerHTML = `<img src="${data}" alt="製品写真" /> <button class="ghost" type="button" onclick="clearProductImage()">写真を消す</button>`;
  }else{
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}
function clearProductImage(){
  pendingProductImageData = '';
  if($('productImageInput')) $('productImageInput').value = '';
  setProductImagePreview('');
}
window.clearProductImage = clearProductImage;
function handleProductImageFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingProductImageData = String(reader.result || '');
    setProductImagePreview(pendingProductImageData);
  };
  reader.readAsDataURL(file);
}

function openChatgptLink(){
  const url = getChatgptLink();
  if(!url){
    alert('設定でChatGPTリンクを登録してください。');
    $('configPanel')?.classList.remove('hidden');
    $('chatgptLink')?.focus();
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
window.openChatgptLink = openChatgptLink;


function setStatus(message, type=''){
  const el = $('appStatus');
  el.textContent = message;
  el.className = `notice small ${type}`.trim();
}

function escapeHtml(str){
  return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
}

function initSupabase(){
  const url = localStorage.getItem('supabaseUrl') || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('supabaseKey') || DEFAULT_SUPABASE_KEY;
  if(!localStorage.getItem('supabaseUrl') && DEFAULT_SUPABASE_URL) localStorage.setItem('supabaseUrl', DEFAULT_SUPABASE_URL);
  if(!localStorage.getItem('supabaseKey') && DEFAULT_SUPABASE_KEY) localStorage.setItem('supabaseKey', DEFAULT_SUPABASE_KEY);
  $('supabaseUrl').value = url;
  $('supabaseKey').value = key;
  if($('familyCode')) $('familyCode').value = getFamilyCode();
  if($('memberName')) $('memberName').value = getMemberName() === '未設定' ? '' : getMemberName();
  if($('nearestStation')) $('nearestStation').value = getNearestStation();
  if($('chatgptLink')) $('chatgptLink').value = getChatgptLink();
  if($('familyStatus')) $('familyStatus').textContent = `家族ID：${getFamilyCode()} / メンバー：${getMemberName()} / ログイン：${currentAccount || '未ログイン'}`;
  migrateOldShoppingLocal();

  if(url && key && window.supabase){
    supabaseClient = window.supabase.createClient(url, key);
    mode = 'supabase';
    $('configStatus').textContent = 'Supabase設定があります。クラウド保存で読み込みます。';
    return;
  }

  supabaseClient = null;
  mode = 'local';
  $('configStatus').textContent = 'Supabase未設定です。ブラウザ内保存で使います。';
}

function normalizeProductRecord(p){
  if(!p) return p;
  return {
    ...p,
    product_name: p.product_name || p.name || p.title || p.item_name || '',
    volume: p.volume ?? p.amount ?? null,
    unit: p.unit || '',
    category: p.category || p.genre || ''
  };
}

function isMissingColumnError(error, columnName){
  const msg = String(error?.message || error?.details || '');
  return msg.includes(columnName) && (msg.includes('schema cache') || msg.includes('column') || msg.includes('Could not find'));
}

async function loadAll(){
  await loadApprovedAccounts();
  await loadSupportConfig();
  showLoginGate();
  if(mode === 'supabase' && supabaseClient){
    const p = await supabaseClient.from('products').select('*').order('created_at',{ascending:false});
    if(p.error){ fallbackToLocal('商品データの読み込みに失敗したため、ブラウザ内保存に切り替えました。'); return; }
    const pr = await supabaseClient.from('price_records').select('*').order('created_at',{ascending:false});
    if(pr.error){ fallbackToLocal('価格データの読み込みに失敗したため、ブラウザ内保存に切り替えました。'); return; }
    const s = await supabaseClient.from('shopping_items').select('*').eq('family_code', getFamilyCode()).order('created_at',{ascending:false});
    if(s.error){ fallbackToLocal('買い物リストの読み込みに失敗したため、ブラウザ内保存に切り替えました。'); return; }
    products = (p.data || []).map(normalizeProductRecord);
    prices = pr.data || [];
    shoppingItems = s.data || [];
    render();
    setStatus(`Supabase接続OK。商品・価格は全体共有、買い物リストは家族ID「${getFamilyCode()}」で共有中です。`,'ok');
    return;
  }

  products = readLocal('otokuProducts').map(normalizeProductRecord);
  prices = readLocal('otokuPrices');
  shoppingItems = readLocal(shoppingStorageKey());
  render();
  setStatus(`ブラウザ内保存モードです。買い物リストは家族ID「${getFamilyCode()}」で分けて保存します。`,'ok');
}

function fallbackToLocal(message){
  console.warn(message);
  mode = 'local';
  supabaseClient = null;
  products = readLocal('otokuProducts').map(normalizeProductRecord);
  prices = readLocal('otokuPrices');
  shoppingItems = readLocal(shoppingStorageKey());
  render();
  setStatus(message, 'error');
}

function saveLocalAll(){
  writeLocal('otokuProducts', products);
  writeLocal('otokuPrices', prices);
  writeLocal(shoppingStorageKey(), shoppingItems.map(i => ({...i, family_code: i.family_code || getFamilyCode()}))); 
}


function debugLine(lines, label, value){
  lines.push(`${label}: ${value}`);
}

async function runDiagnostics(){
  const out = $('debugOutput');
  const lines = [];
  if(out){
    out.classList.remove('hidden');
    out.textContent = '診断中...';
  }
  try{
    debugLine(lines, 'ログイン中', currentAccount || '未ログイン');
    debugLine(lines, '保存モード', mode);
    debugLine(lines, 'Supabase URL', localStorage.getItem('supabaseUrl') || DEFAULT_SUPABASE_URL || '未設定');
    debugLine(lines, 'Supabase key', ((localStorage.getItem('supabaseKey') || DEFAULT_SUPABASE_KEY || '').slice(0,18) + '...'));
    debugLine(lines, '画面上の商品件数', products.length);

    if(!supabaseClient || mode !== 'supabase'){
      lines.push('結果: Supabaseに接続されていません。設定を確認してください。');
      lines.push('対策: 設定にSupabase URLとPublishable keyを保存してください。');
      if(out) out.textContent = lines.join('\n');
      console.log('[otoku diagnostics]', lines);
      return;
    }

    const readRes = await supabaseClient.from('products').select('*').limit(1);
    if(readRes.error){
      lines.push('products読み込み: NG');
      lines.push(`ERROR: ${readRes.error.message}`);
      lines.push('対策: v26以降のschema.sqlをSupabase SQL Editorで再実行してください。');
      if(out) out.textContent = lines.join('\n');
      console.error('[otoku diagnostics]', readRes.error);
      return;
    }
    lines.push('products読み込み: OK');
    if(readRes.data && readRes.data[0]){
      lines.push('products列: ' + Object.keys(readRes.data[0]).join(', '));
    } else {
      lines.push('products列: データ0件のため列名は表示できません。テスト登録で確認します。');
    }

    const testName = `診断テスト_${Date.now()}`;
    const insertRes = await supabaseClient.from('products').insert({
      product_name: testName,
      volume: 1,
      unit: '個',
      category: '診断',
      created_at: new Date().toISOString()
    }).select().single();

    if(insertRes.error){
      lines.push('商品テスト登録: NG');
      lines.push(`ERROR: ${insertRes.error.message}`);
      if(isMissingColumnError(insertRes.error, 'product_name')){
        lines.push('原因候補: productsテーブルに product_name 列がありません。');
      }
      lines.push('対策: v26以降のschema.sqlをSupabase SQL Editorで再実行してください。');
      if(out) out.textContent = lines.join('\n');
      console.error('[otoku diagnostics]', insertRes.error);
      return;
    }

    lines.push('商品テスト登録: OK');
    lines.push(`登録ID: ${insertRes.data?.id || '不明'}`);

    if(insertRes.data?.id){
      const delRes = await supabaseClient.from('products').delete().eq('id', insertRes.data.id);
      if(delRes.error){
        lines.push(`テスト商品の削除: NG / ${delRes.error.message}`);
      } else {
        lines.push('テスト商品の削除: OK');
      }
    }

    lines.push('結論: Supabase保存は動いています。もう一度、製品登録を試してください。');
    if(out) out.textContent = lines.join('\n');
    console.log('[otoku diagnostics]', lines);
  }catch(err){
    lines.push('診断中にエラーが発生しました。');
    lines.push(String(err?.message || err));
    if(out) out.textContent = lines.join('\n');
    console.error('[otoku diagnostics fatal]', err);
  }
}
window.runDiagnostics = runDiagnostics;


function renderHomeSettings(){
  const chatStatus = $('chatgptLinkStatus');
  if(chatStatus){
    chatStatus.textContent = getChatgptLink() ? 'ChatGPTリンク登録済み。ボタンで開けます。' : '設定でChatGPTリンクを登録すると、このボタンから開けます。';
  }
}

function render(){
  $('productCount').textContent = `${products.length}件`;
  if($('familyStatus')) $('familyStatus').textContent = `家族ID：${getFamilyCode()} / メンバー：${getMemberName()} / ログイン：${currentAccount || '未ログイン'}`;
  renderProductSuggestions();
  renderManualAssist();
  renderProducts();
  renderPriceSelect();
  renderShoppingProductSelect();
  renderStoreSuggestions();
  renderPrices();
  renderShopping();
  renderSavings();
  renderSupport();
}

function sortPriceRows(rows){
  return [...rows].sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function productPriceRows(productId){
  return sortPriceRows(
    prices
      .filter(r => r.product_id === productId)
      .map(r => ({...r, price:Number(r.price)||0}))
      .filter(r => r.price > 0)
  );
}

function productPriceStats(productId){
  const rows = productPriceRows(productId);
  if(!rows.length) return null;
  const latest = rows[0];
  const min = rows.reduce((a,b)=> a.price <= b.price ? a : b);
  const max = rows.reduce((a,b)=> a.price >= b.price ? a : b);
  const avg = rows.reduce((sum,r)=>sum+r.price,0)/rows.length;
  const stores = [...new Set(rows.map(r => r.store_name || '店舗未入力'))];
  return { latest, min, max, avg, count: rows.length, stores, rows };
}

function productStoreHistory(productId){
  const rows = productPriceRows(productId);
  const grouped = {};
  rows.forEach(row => {
    const key = row.store_name || '店舗未入力';
    if(!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });
  return Object.entries(grouped).map(([store, list]) => {
    const sorted = sortPriceRows(list);
    const min = sorted.reduce((a,b)=> a.price <= b.price ? a : b);
    const max = sorted.reduce((a,b)=> a.price >= b.price ? a : b);
    const avg = sorted.reduce((sum,r)=>sum+r.price,0)/sorted.length;
    return { store, latest: sorted[0], min, max, avg, count: sorted.length, rows: sorted };
  }).sort((a,b) => {
    if(a.latest.price !== b.latest.price) return a.latest.price - b.latest.price;
    return new Date(b.latest.created_at || 0) - new Date(a.latest.created_at || 0);
  });
}

function renderStoreHistory(product){
  const groups = productStoreHistory(product.id);
  if(!groups.length) return '';
  return `<details class="store-history" open>
    <summary>店舗別の価格履歴を見る</summary>
    <div class="store-history-list">
      ${groups.map(g => `
        <div class="store-history-card">
          <div class="store-history-head">
            <div>
              <strong>${escapeHtml(g.store)}</strong>
              <small>${g.count}件登録</small>
            </div>
            <span class="badge">最新 ${yen(g.latest.price)}</span>
          </div>
          <div class="store-history-stats">
            <span>最安 ${yen(g.min.price)}</span>
            <span>平均 ${yen(g.avg)}</span>
            <span>最高 ${yen(g.max.price)}</span>
          </div>
          <div class="store-history-rows">
            ${g.rows.slice(0,6).map(r => `
              <div class="history-row">
                <span class="date-strong">${formatDate(r.created_at)}${r.member_name ? ' / ' + escapeHtml(r.member_name) : ''}</span>
                <b>${yen(r.price)}</b>
                <button class="ghost mini-btn" type="button" onclick="openStorePrice('${product.id}', '${escapeHtml(g.store).replace(/'/g,'&#039;')}')">同じ店で追加</button>
                <button class="ghost mini-btn" type="button" onclick="editPrice('${r.id}')">編集</button>
                <button class="danger mini-btn" type="button" onclick="deletePrice('${r.id}')">削除</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  </details>`;
}

function unitPriceText(product, price){
  const vol = Number(product.volume)||0;
  if(!vol || !price) return '';
  return `${(Number(price)/vol).toFixed(2)}円/${escapeHtml(product.unit || '単位')}`;
}

function renderProductSuggestions(){
  const datalist = $('productNameSuggestions');
  if(!datalist) return;
  datalist.innerHTML = getProductNameCandidates().map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}


function isProductPinned(product){
  if(product && product.is_favorite) return true;
  const pins = readLocal('otokuPinnedProducts');
  return pins.includes(product?.id);
}

function sortedProducts(){
  return [...products].sort((a,b) => {
    const ap = isProductPinned(a) ? 1 : 0;
    const bp = isProductPinned(b) ? 1 : 0;
    if(ap !== bp) return bp - ap;
    const ar = productPriceRows(a.id)[0]?.created_at || a.created_at || '';
    const br = productPriceRows(b.id)[0]?.created_at || b.created_at || '';
    return new Date(br || 0) - new Date(ar || 0);
  });
}

function renderPriceChart(productId){
  const rows = productPriceRows(productId).slice().reverse();
  if(rows.length < 2) return '<div class="chart-empty small">価格履歴グラフは、価格を2件以上登録すると表示されます。</div>';
  const w = 320, h = 150, pad = 26;
  const vals = rows.map(r => Number(r.price)||0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const x = (i) => pad + (rows.length === 1 ? 0 : i * (w - pad*2) / (rows.length - 1));
  const y = (v) => h - pad - ((v - min) / span) * (h - pad*2);
  const pts = rows.map((r,i) => `${x(i).toFixed(1)},${y(Number(r.price)||0).toFixed(1)}`).join(' ');
  const dots = rows.map((r,i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(Number(r.price)||0).toFixed(1)}" r="4"><title>${new Date(r.created_at||Date.now()).toLocaleDateString()} ${r.store_name||''} ${yen(r.price)}</title></circle>`).join('');
  const last = rows[rows.length-1];
  const first = rows[0];
  const trend = Number(last.price) < Number(first.price) ? '値下がり傾向' : Number(last.price) > Number(first.price) ? '値上がり傾向' : '横ばい';
  return `<details class="price-chart" open>
    <summary>価格履歴グラフ</summary>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="価格履歴グラフ">
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="axis"></line>
        <line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="axis"></line>
        <polyline points="${pts}" class="price-line"></polyline>
        ${dots}
        <text x="${pad}" y="18" class="chart-label">最高 ${yen(max)}</text>
        <text x="${pad}" y="${h-6}" class="chart-label">最安 ${yen(min)}</text>
      </svg>
      <div class="chart-summary"><strong>${trend}</strong><span>${rows.length}件の履歴 / 最新 ${yen(last.price)}</span></div>
    </div>
  </details>`;
}



function buyTimingHtml(st){
  if(!st || st.count < 2){
    return '<div class="timing-chip neutral">買い時判定：価格履歴を2件以上登録すると表示</div>';
  }
  const latest = Number(st.latest.price) || 0;
  const avg = Number(st.avg) || 0;
  const min = Number(st.min.price) || 0;
  const diffAvg = avg - latest;
  if(latest <= min){
    return `<div class="timing-chip good">買い時：過去最安値です</div>`;
  }
  if(avg && latest <= avg * 0.95){
    return `<div class="timing-chip good">買い時：平均より${yen(diffAvg)}安い</div>`;
  }
  if(avg && latest >= avg * 1.10){
    return `<div class="timing-chip caution">高め：平均より${yen(latest - avg)}高い</div>`;
  }
  return '<div class="timing-chip normal">いつも通り：平均価格に近いです</div>';
}

function quickPriceCandidates(st){
  const base = [];
  if(st){
    base.push(Number(st.latest.price) || 0, Number(st.min.price) || 0, Math.round(Number(st.avg) || 0));
  }
  base.push(98,128,158,178,198,218,248,298,348,398,498,598,698,798,980,1280);
  return [...new Set(base.filter(v => v > 0))].slice(0, 6);
}

function quickPriceButtons(productId, st){
  const buttons = quickPriceCandidates(st).map(v => `<button class="quick-price-btn" type="button" onclick="quickRegisterPrice('${productId}', ${v})">${v}円</button>`).join('');
  return `<div class="quick-price-box"><div class="quick-price-title">価格だけ登録</div><div class="quick-price-row">${buttons}<button class="quick-price-btn manual" type="button" onclick="openQuickPrice('${productId}')">入力</button></div><p class="small">前回店舗を使って、タップだけで価格登録できます。</p></div>`;
}

async function quickRegisterPrice(productId, price){
  const product = products.find(p => p.id === productId);
  if(!product){ alert('商品が見つかりません。'); return; }
  const storeName = localStorage.getItem(`lastStoreFor_${productId}`) || localStorage.getItem('lastStoreName') || '店舗未入力';
  const item = { product_id: productId, store_name: storeName, price: Number(price), member_name: getMemberName() };
  if(storeName && storeName !== '店舗未入力'){
    localStorage.setItem('lastStoreName', storeName);
    localStorage.setItem(`lastStoreFor_${productId}`, storeName);
  }
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('price_records').insert(item).select().single();
    if(res.error){ fallbackToLocal(`価格登録に失敗しました：${res.error.message}`); return; }
  } else {
    prices.unshift({ id: uid(), ...item });
    saveLocalAll();
  }
  setStatus(`${product.product_name}を${yen(price)}で登録しました。店舗：${storeName}`,'ok');
  await loadAll();
}
window.quickRegisterPrice = quickRegisterPrice;

function renderProducts(){
  $('productList').innerHTML = sortedProducts().map(p => {
    const st = productPriceStats(p.id);
    const img = p.image_data ? `<div class="product-photo"><img src="${p.image_data}" alt="${escapeHtml(p.product_name)}" /></div>` : '';
    if(!st){
      return `<div class="product-card">
        <div class="product-head">${img}<div><h3>${isProductPinned(p) ? '📌 ' : ''}${escapeHtml(p.product_name)}</h3><p class="small">${escapeHtml(p.category || '未分類')} / ${p.volume || '-'}${escapeHtml(p.unit || '')}</p></div><span class="badge pale">価格未登録</span></div>
        <div class="empty-price">価格が未登録です。まず価格を1件登録すると、比較と買い時判定が使えます。</div>
        <div class="card-actions two-actions">
          <button class="primary wide-btn" type="button" onclick="openQuickPrice('${p.id}')">価格を追加</button>
          <button class="ghost wide-btn" type="button" onclick="toggleProductPin('${p.id}')">${isProductPinned(p) ? '固定解除' : '上に固定'}</button>
        </div>
        <details class="product-more">
          <summary>編集・削除</summary>
          <div class="card-actions two-actions">
            <button class="ghost wide-btn" type="button" onclick="editProduct('${p.id}')">編集</button>
            <button class="danger wide-btn" type="button" onclick="deleteProduct('${p.id}')">削除</button>
          </div>
        </details>
      </div>`;
    }
    const saved = Math.max(0, st.avg - st.latest.price);
    return `<div class="product-card">
      <div class="product-head">
        ${img}<div><h3>${isProductPinned(p) ? '📌 ' : ''}${escapeHtml(p.product_name)}</h3><p class="small">${escapeHtml(p.category || '未分類')} / ${p.volume || '-'}${escapeHtml(p.unit || '')}</p></div>
        <span class="badge">${st.count}件</span>
      </div>
      <div class="price-main">
        <div><span>最新価格</span><strong>${yen(st.latest.price)}</strong><small>${escapeHtml(st.latest.store_name || '店舗未入力')}</small></div>
        <div><span>最安値</span><strong>${yen(st.min.price)}</strong><small>${escapeHtml(st.min.store_name || '店舗未入力')}</small></div>
      </div>
      ${buyTimingHtml(st)}
      ${quickPriceButtons(p.id, st)}
      <details class="product-more">
        <summary>詳細を見る・編集する</summary>
        <div class="price-sub">
          <span>平均 ${yen(st.avg)}</span>
          <span>最高 ${yen(st.max.price)}</span>
          <span>${unitPriceText(p, st.latest.price) || '単価未設定'}</span>
        </div>
        <div class="stores-line">登録店舗：${escapeHtml(st.stores.join('、') || '未入力')}</div>
        <div class="saving-line">${saved > 0 ? `平均より ${yen(saved)} お得` : '平均価格以上です。次回の比較に使えます。'}</div>
        ${renderPriceChart(p.id)}
        ${renderStoreHistory(p)}
        <div class="card-actions">
          <button class="primary wide-btn" type="button" onclick="openQuickPrice('${p.id}')">価格を追加</button>
          <button class="ghost wide-btn" type="button" onclick="toggleProductPin('${p.id}')">${isProductPinned(p) ? '固定解除' : '上に固定'}</button>
          <button class="ghost wide-btn" type="button" onclick="editProduct('${p.id}')">編集</button>
          <button class="danger wide-btn" type="button" onclick="deleteProduct('${p.id}')">削除</button>
        </div>
      </details>
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


function renderStationAssist(){
  const input = $('nearestStation');
  const query = (input?.value || '').trim();
  const candidates = getStationCandidates(query);
  const stationList = $('stationSuggestions');
  if(stationList){
    stationList.innerHTML = candidates.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
  }
  const chips = $('stationChips');
  if(chips){
    chips.innerHTML = candidates.slice(0, 10).map(name => `<button class="chip" type="button" onclick="setNearestStation('${escapeHtml(name).replace(/'/g,'&#039;')}')">${escapeHtml(name)}</button>`).join('');
  }
}

function renderStoreSuggestions(){
  const datalist = $('storeSuggestions');
  if(datalist){
    datalist.innerHTML = getStoreCandidates().map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
  }
  renderStationAssist();
  const branchList = $('branchSuggestions');
  if(branchList){
    branchList.innerHTML = stationBranchCandidates().map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
  }
  const chips = $('storeChips');
  if(chips){
    const recent = getStoreCandidates().slice(0, 12);
    chips.innerHTML = recent.map(name => `<button class="chip" type="button" onclick="setStoreName('${escapeHtml(name).replace(/'/g,'&#039;')}')">${escapeHtml(name)}</button>`).join('');
  }
  const branchChips = $('branchChips');
  if(branchChips){
    const recentBranches = stationBranchCandidates().slice(0, 8);
    branchChips.innerHTML = recentBranches.map(name => `<button class="chip" type="button" onclick="setBranchName('${escapeHtml(name).replace(/'/g,'&#039;')}')">${escapeHtml(name)}</button>`).join('');
  }
}

function extractBranchName(store){
  const s = String(store || '').trim();
  const m = s.match(/(.+?)([\w\u3040-\u30ff\u3400-\u9fffー・]+店)$/);
  return m ? m[2] : '';
}
function combineStoreName(){
  const base = ($('storeName')?.value || '').trim();
  const branch = ($('storeBranch')?.value || '').trim();
  if(!branch) return base;
  if(!base) return branch;
  if(base.includes(branch)) return base;
  return `${base} ${branch}`.trim();
}
function splitStoreName(full){
  const s = String(full || '').trim();
  const branch = extractBranchName(s);
  if(!branch) return {base:s, branch:''};
  return {base:s.replace(branch,'').trim(), branch};
}

function setStoreName(name){
  $('storeName').value = name;
  if($('storeBranch')) $('storeBranch').focus();
  else $('priceValue').focus();
}
function setBranchName(name){
  if($('storeBranch')) $('storeBranch').value = name;
  $('priceValue')?.focus();
}
window.setBranchName = setBranchName;
window.setStoreName = setStoreName;

function openQuickPrice(productId){
  document.querySelectorAll('.tab,.tab-panel').forEach(e => e.classList.remove('active'));
  document.querySelector('[data-tab="prices"]').classList.add('active');
  $('prices').classList.add('active');
  $('priceProduct').value = productId;
  const store = localStorage.getItem(`lastStoreFor_${productId}`) || localStorage.getItem('lastStoreName') || '';
  const parts = splitStoreName(store);
  $('storeName').value = parts.base;
  if($('storeBranch')) $('storeBranch').value = parts.branch;
  $('priceValue').value = '';
  $('priceValue').focus();
  const product = products.find(p => p.id === productId);
  setStatus(`${product?.product_name || '商品'}の価格を追加します。店舗候補を確認して、価格だけ入れてください。`, 'ok');
}
window.openQuickPrice = openQuickPrice;

function openStorePrice(productId, storeName){
  openQuickPrice(productId);
  const parts = splitStoreName(storeName || '');
  $('storeName').value = parts.base;
  if($('storeBranch')) $('storeBranch').value = parts.branch;
  if($('priceDate')) $('priceDate').value = todayDateInput();
  const product = products.find(p => p.id === productId);
  setStatus(`${product?.product_name || '商品'}に、${storeName || '同じ店舗'}の新しい価格を追加します。日付と価格を確認してください。`, 'ok');
}
window.openStorePrice = openStorePrice;

function renderPrices(){
  $('priceList').innerHTML = sortPriceRows(prices).map(r => {
    const product = products.find(p => p.id === r.product_id);
    const name = r.products?.product_name || product?.product_name || '商品';
    return `<div class="item price-item"><div><h3>${escapeHtml(name)}</h3><p class="small"><strong class="date-strong">${formatDate(r.created_at)}</strong> / ${escapeHtml(r.store_name || '店舗未入力')}${r.member_name ? ' / 登録者：' + escapeHtml(r.member_name) : ''}</p></div><span class="badge">${yen(r.price)}</span><div class="item-actions"><button class="ghost" type="button" onclick="editPrice('${r.id}')">編集</button><button class="danger" type="button" onclick="deletePrice('${r.id}')">削除</button></div></div>`;
  }).join('') || '<p class="small">まだ価格履歴がありません。</p>';
}

function editPrice(id){
  const r = prices.find(x => x.id === id);
  if(!r) return;
  $('priceEditId').value = r.id;
  $('priceProduct').value = r.product_id || '';
  const storeParts = splitStoreName(r.store_name || '');
  $('storeName').value = storeParts.base;
  if($('storeBranch')) $('storeBranch').value = storeParts.branch;
  $('priceValue').value = r.price || '';
  if($('priceDate')) $('priceDate').value = (r.created_at || '').slice(0,10) || todayDateInput();
  $('addPriceBtn').textContent = '価格を更新';
  $('cancelPriceEditBtn').classList.remove('hidden');
  document.querySelector('[data-tab="prices"]').click();
  $('priceValue').focus();
  setStatus('価格履歴を編集中です。価格・店舗を直して更新してください。','ok');
}
window.editPrice = editPrice;

function resetPriceForm(){
  $('priceEditId').value = '';
  $('priceValue').value = '';
  if($('storeBranch')) $('storeBranch').value = '';
  if($('priceDate')) $('priceDate').value = todayDateInput();
  $('addPriceBtn').textContent = '価格を登録';
  $('cancelPriceEditBtn').classList.add('hidden');
}

async function deletePrice(id){
  if(!confirm('この価格履歴を削除します。よろしいですか？')) return;
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('price_records').delete().eq('id', id);
    if(res.error){ fallbackToLocal(`価格削除に失敗しました：${res.error.message}`); return; }
  } else {
    prices = prices.filter(r => r.id !== id);
    saveLocalAll();
  }
  setStatus('価格履歴を削除しました。','ok');
  await loadAll();
}
window.deletePrice = deletePrice;

function renderShopping(){
  $('shoppingList').innerHTML = shoppingItems.map(i => {
    const product = products.find(p => p.id === i.product_id);
    const st = product ? productPriceStats(product.id) : null;
    const name = product?.product_name || i.item_name || '商品';
    const detail = product ? `${product.category || '未分類'} / ${product.volume || '-'}${product.unit || ''}` : '登録商品情報なし';
    const priceInfo = st ? `目安：最新 ${yen(st.latest.price)} / 最安 ${yen(st.min.price)}` : '価格未登録';
    return `
    <div class="item">
      <div><h3>${i.purchased ? '✅' : '□'} ${escapeHtml(name)}</h3><p class="small">数量：${escapeHtml(i.quantity || '1')}　${escapeHtml(detail)}${i.member_name ? '　追加者：' + escapeHtml(i.member_name) : ''}<br>${escapeHtml(priceInfo)}</p></div>
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


async function toggleProductPin(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  const next = !isProductPinned(p);
  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('products').update({is_favorite: next}).eq('id', id);
    if(res.error){ fallbackToLocal(`固定状態の更新に失敗しました：${res.error.message}`); return; }
  } else {
    const pins = readLocal('otokuPinnedProducts').filter(x => x !== id);
    if(next) pins.unshift(id);
    writeLocal('otokuPinnedProducts', pins);
    products = products.map(x => x.id === id ? {...x, is_favorite: next} : x);
    saveLocalAll();
  }
  setStatus(next ? 'よく買う商品として上に固定しました。' : '固定を解除しました。','ok');
  await loadAll();
}
window.toggleProductPin = toggleProductPin;

async function addProduct(){
  const product_name = $('productName').value.trim();
  if(!product_name){ alert('商品名を入力してください。'); return; }
  const editId = $('productEditId')?.value || '';
  if(editId && !pendingProductImageData){
    const existing = products.find(p => p.id === editId);
    if(existing?.image_data) pendingProductImageData = existing.image_data;
  }
  const item = { product_name, volume: Number($('productVolume').value) || null, unit: $('productUnit').value, category: $('productCategory').value.trim(), image_data: pendingProductImageData || null };

  if(mode === 'supabase' && supabaseClient){
    if(editId){
      let res = await supabaseClient.from('products').update(item).eq('id', editId);
      if(res.error && isMissingColumnError(res.error, 'product_name')){
        const legacyItem = {...item, name: item.product_name};
        delete legacyItem.product_name;
        res = await supabaseClient.from('products').update(legacyItem).eq('id', editId);
      }
      if(res.error){
        setStatus(`クラウドへの商品更新に失敗しました：${res.error.message}。schema.sqlをSupabaseで再実行してください。`, 'error');
        return;
      }
    } else {
      let res = await supabaseClient.from('products').insert({...item, created_at: new Date().toISOString()}).select().single();
      if(res.error && isMissingColumnError(res.error, 'product_name')){
        const legacyItem = {...item, name: item.product_name, created_at: new Date().toISOString()};
        delete legacyItem.product_name;
        res = await supabaseClient.from('products').insert(legacyItem).select().single();
      }
      if(res.error){
        setStatus(`クラウドへの商品登録に失敗しました：${res.error.message}。schema.sqlをSupabaseで再実行してください。`, 'error');
        return;
      }
    }
  } else {
    if(editId){
      products = products.map(p => p.id === editId ? {...p, ...item} : p);
      prices = prices.map(r => r.product_id === editId ? {...r, products:{product_name}} : r);
      shoppingItems = shoppingItems.map(i => i.product_id === editId ? {...i, item_name: product_name} : i);
    } else {
      products.unshift({ id: uid(), ...item, created_at: new Date().toISOString() });
    }
    saveLocalAll();
  }

  rememberProductName(product_name);
  resetProductForm();
  setStatus(editId ? '製品を更新しました。' : '製品を追加しました。次に価格登録をしてください。','ok');
  await loadAll();
}

function editProduct(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  $('productEditId').value = p.id;
  $('productName').value = p.product_name || '';
  $('productVolume').value = p.volume || '';
  $('productUnit').value = p.unit || 'ml';
  $('productCategory').value = p.category || '';
  pendingProductImageData = p.image_data || '';
  setProductImagePreview(pendingProductImageData);
  $('addProductBtn').textContent = '製品を更新';
  $('cancelProductEditBtn').classList.remove('hidden');
  document.querySelector('[data-tab="products"]').click();
  $('productName').focus();
  setStatus('製品を編集中です。内容を直して「製品を更新」を押してください。','ok');
}
window.editProduct = editProduct;

function resetProductForm(){
  $('productEditId').value = '';
  $('productName').value = '';
  $('productVolume').value = '';
  $('productCategory').value = '';
  pendingProductImageData = '';
  if($('productImageInput')) $('productImageInput').value = '';
  setProductImagePreview('');
  $('addProductBtn').textContent = '製品を追加';
  $('cancelProductEditBtn').classList.add('hidden');
}

async function deleteProduct(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  if(!confirm(`${p.product_name}を削除します。価格履歴も削除されます。よろしいですか？`)) return;

  if(mode === 'supabase' && supabaseClient){
    const res = await supabaseClient.from('products').delete().eq('id', id);
    if(res.error){ fallbackToLocal(`製品削除に失敗しました：${res.error.message}`); return; }
  } else {
    products = products.filter(p => p.id !== id);
    prices = prices.filter(r => r.product_id !== id);
    shoppingItems = shoppingItems.filter(i => i.product_id !== id);
    saveLocalAll();
  }
  setStatus('製品を削除しました。','ok');
  await loadAll();
}
window.deleteProduct = deleteProduct;

async function addShoppingByProduct(productId, qty='1'){
  const product = products.find(p => p.id === productId);
  qty = String(qty || '1').trim() || '1';
  if(!product){ alert('先に「商品・価格」タブで商品を登録してください。'); return; }

  const item = { product_id: product.id, item_name: product.product_name, quantity: qty, memo: '', purchased: false, family_code: getFamilyCode(), member_name: getMemberName(), created_at: new Date().toISOString() };

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
  const editId = $('priceEditId')?.value || '';
  if(!product_id){ alert('先に「商品」タブで商品を登録してください。'); return; }
  if(!price){ alert('価格を入力してください。'); return; }
  const typedStore = combineStoreName();
  const storeName = typedStore || localStorage.getItem(`lastStoreFor_${product_id}`) || localStorage.getItem('lastStoreName') || '';
  const created_at = dateInputToIso($('priceDate')?.value || todayDateInput());
  const item = { product_id, store_name: storeName, price, member_name: getMemberName(), created_at };

  if(storeName){
    localStorage.setItem('lastStoreName', storeName);
    localStorage.setItem(`lastStoreFor_${product_id}`, storeName);
  }

  if(mode === 'supabase' && supabaseClient){
    if(editId){
      const res = await supabaseClient.from('price_records').update(item).eq('id', editId);
      if(res.error){ fallbackToLocal(`価格更新に失敗しました：${res.error.message}`); return; }
    } else {
      const res = await supabaseClient.from('price_records').insert(item).select().single();
      if(res.error){ fallbackToLocal(`価格登録に失敗しました：${res.error.message}`); return; }
    }
  } else {
    if(editId){
      prices = prices.map(r => r.id === editId ? {...r, ...item} : r);
    } else {
      prices.unshift({ id: uid(), ...item });
    }
    saveLocalAll();
  }

  resetPriceForm();
  setStatus(editId ? '価格を更新しました。' : '価格を登録しました。','ok');
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



const PRODUCT_PHOTO_PROMPT = `あなたは買い物価格管理アプリ「おとくメモ」の商品登録補助AIです。
添付した商品写真から、商品登録に必要な情報を読み取ってください。

必ず以下のJSON形式だけで返してください。説明文は不要です。

{
  "product_name": "",
  "maker": "",
  "jan_code": "",
  "category": "",
  "volume": "",
  "unit": "",
  "store_name": "",
  "price": "",
  "tax_type": "",
  "price_type": "",
  "confidence": "",
  "notes": ""
}

抽出ルール：
- product_name は商品名をできるだけ具体的に入れてください。例：アタックZERO 詰め替え
- maker はメーカー名が分かる場合だけ入れてください。
- jan_code はバーコード番号が読める場合だけ入れてください。
- category は「食品」「飲料」「日用品」「衛生用品」「ベビー用品」「ペット用品」「その他」から選んでください。
- volume は容量や数量を数字だけで入れてください。例：750、1000、12
- unit は ml、L、g、kg、個、枚、本、ロール、パック のどれかにしてください。
- 写真が値札・棚札も含む場合は、price に価格を数字だけで入れてください。
- store_name が分かる場合は店舗名を入れてください。
- tax_type は「税込」「税抜」「不明」のどれかにしてください。
- price_type は「通常」「セール」「クーポン」「不明」のどれかにしてください。
- confidence は high、medium、low のどれかにしてください。
- 不明な項目は空欄にしてください。
- 推測した内容や注意点は notes に短く書いてください。`;

const PRICE_TAG_PROMPT = `あなたは買い物価格管理アプリ「おとくメモ」の値札読み取り補助AIです。
添付した値札写真から、価格登録に必要な情報を読み取ってください。

必ず以下のJSON形式だけで返してください。説明文は不要です。

{
  "product_name": "",
  "store_name": "",
  "price": "",
  "tax_type": "",
  "price_type": "",
  "volume": "",
  "unit": "",
  "store_name": "",
  "price": "",
  "tax_type": "",
  "price_type": "",
  "confidence": "",
  "notes": ""
}

抽出ルール：
- price は税込と思われる価格を数字だけで入れてください。例：298
- 税抜価格しか見えない場合は、その数字を入れ、tax_type を「税抜」にしてください。
- tax_type は「税込」「税抜」「不明」のどれかにしてください。
- price_type は「通常」「セール」「クーポン」「不明」のどれかにしてください。
- product_name は値札から読める場合だけ入れてください。
- store_name は店舗名が分かる場合だけ入れてください。
- volume と unit は値札から読める場合だけ入れてください。
- confidence は high、medium、low のどれかにしてください。
- 複数の価格が見える場合は、対象商品の価格と思われるものを price に入れ、notes に他候補を書いてください。
- 不明な項目は空欄にしてください。`;

async function copyText(text, statusId){
  try{
    await navigator.clipboard.writeText(text);
    if($(statusId)) { $(statusId).textContent = 'プロンプトをコピーしました。ChatGPTに写真と一緒に貼り付けてください。'; $(statusId).className = 'small copy-ok'; }
  }catch(e){
    if($(statusId)) { $(statusId).textContent = 'コピーできませんでした。長押しで手動コピーしてください。'; $(statusId).className = 'small copy-ng'; }
    alert(text);
  }
}

function normalizePasteText(raw){
  return String(raw || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .trim();
}

function cleanAiKey(key){
  return String(key || '')
    .trim()
    .replace(/["'“”‘’`「」『』\[\]{}]/g,'')
    .replace(/\s/g,'')
    .toLowerCase();
}

function cleanAiValue(val){
  return String(val || '')
    .trim()
    .replace(/^["'“”‘’`「」『』]+|["'“”‘’`」』]+$/g,'')
    .replace(/,$/,'')
    .trim();
}

function extractJsonObject(raw){
  let text = normalizePasteText(raw);
  if(!text) return null;
  text = text.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();

  // ChatGPTの返答が前後に説明文を含んでも、JSON部分だけを優先して拾う。
  const candidates = [text];
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if(arrayMatch) candidates.push(arrayMatch[0]);
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if(objectMatch) candidates.push(objectMatch[0]);

  for(const c of candidates){
    try {
      const parsed = JSON.parse(c);
      if(Array.isArray(parsed)) return parsed[0] || null;
      if(parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  // JSONとして壊れていても「商品名：牛乳」や "product_name":"牛乳" を読めるようにする。
  const obj = {};
  text.split(/\n|,/).forEach(line => {
    const m = line.match(/^\s*[-・*]?\s*([^:=]+)[:=]\s*(.+?)\s*$/);
    if(!m) return;
    const key = cleanAiKey(m[1]);
    const val = cleanAiValue(m[2]);
    if(key && val) obj[key] = val;
  });

  // 1行JSON風で分割に失敗した時の保険
  const pairRegex = /["']?([^"'{}:,]+)["']?\s*:\s*["']?([^"'{},]+)["']?/g;
  let m;
  while((m = pairRegex.exec(text))){
    const key = cleanAiKey(m[1]);
    const val = cleanAiValue(m[2]);
    if(key && val && !obj[key]) obj[key] = val;
  }

  return Object.keys(obj).length ? obj : null;
}

function pick(obj, keys){
  if(!obj) return '';
  const map = {};
  Object.keys(obj).forEach(k => {
    map[cleanAiKey(k)] = obj[k];
  });
  for(const k of keys){
    const direct = obj[k];
    if(direct !== undefined && direct !== null && String(direct).trim() !== '') return cleanAiValue(direct);
    const nk = cleanAiKey(k);
    const v = map[nk];
    if(v !== undefined && v !== null && String(v).trim() !== '') return cleanAiValue(v);
  }
  return '';
}

function splitVolumeUnit(value){
  const text = String(value || '').trim();
  if(!text) return {volume:'', unit:''};
  const m = text.match(/([0-9０-９]+(?:[\.．][0-9０-９]+)?)\s*(ml|ｍｌ|ミリリットル|l|L|Ｌ|リットル|g|ｇ|グラム|kg|ｋｇ|キログラム|個|枚|本|ロール|パック|箱|袋)/i);
  if(!m) return {volume:text.replace(/[^0-9.０-９．]/g,'').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace('．','.'), unit:''};
  const volume = m[1].replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace('．','.');
  let unit = m[2];
  if(/ml|ｍｌ|ミリ/i.test(unit)) unit = 'ml';
  else if(/l|Ｌ|リットル/i.test(unit)) unit = 'L';
  else if(/^g$|ｇ|グラム/i.test(unit)) unit = 'g';
  else if(/kg|ｋｇ|キロ/i.test(unit)) unit = 'kg';
  else if(unit === '箱' || unit === '袋') unit = '個';
  return {volume, unit};
}

function normalizeAiData(obj){
  if(!obj) return null;
  const rawVolume = pick(obj, ['volume','capacity','amount','size','容量','内容量','規格','サイズ']);
  const rawUnit = pick(obj, ['unit','単位']);
  const vu = splitVolumeUnit(rawVolume);
  return {
    product_name: pick(obj, ['product_name','productName','item_name','itemName','商品名','製品名','品名','name','名称']),
    maker: pick(obj, ['maker','brand','メーカー','manufacturer','ブランド']),
    jan_code: pick(obj, ['jan_code','jan','JAN','JANコード','barcode','バーコード']),
    category: pick(obj, ['category','genre','ジャンル','カテゴリ','分類']),
    volume: vu.volume || rawVolume,
    unit: rawUnit || vu.unit,
    store_name: pick(obj, ['store_name','storeName','店舗名','店舗','store','店名']),
    price: pick(obj, ['price','価格','税込価格','金額','sale_price','selling_price']),
    tax_type: pick(obj, ['tax_type','税区分','税込税抜','税']),
    price_type: pick(obj, ['price_type','価格種別','種別','セール種別']),
    date: pick(obj, ['date','登録日','日付','確認日','購入日']),
    confidence: pick(obj, ['confidence','確信度','信頼度']),
    notes: pick(obj, ['notes','note','メモ','注意点','補足'])
  };
}


function normalizeDateInput(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  const normalized = raw.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace(/[年月\.\/]/g,'-').replace(/日/g,'');
  const parts = normalized.split('-').filter(Boolean);
  const now = new Date();
  let y, m, d;
  if(parts.length >= 3){ y = parts[0]; m = parts[1]; d = parts[2]; }
  else if(parts.length === 2){ y = String(now.getFullYear()); m = parts[0]; d = parts[1]; }
  else return '';
  y = String(y).padStart(4,'20');
  m = String(m).padStart(2,'0');
  d = String(d).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function setUnitIfExists(unit){
  if(!unit) return;
  const sel = $('productUnit');
  if(!sel) return;
  const options = Array.from(sel.options).map(o => o.value);
  if(options.includes(unit)) sel.value = unit;
  else if(unit === 'リットル') sel.value = 'L';
  else if(unit === 'ミリリットル') sel.value = 'ml';
  else if(unit === 'グラム') sel.value = 'g';
  else if(unit === 'キログラム') sel.value = 'kg';
}

async function applyProductAiResult(autoRegister=false){
  const raw = $('productAiResult')?.value || '';
  const data = normalizeAiData(extractJsonObject(raw));
  if(!data){ alert('AI結果を読み取れませんでした。コピーした内容をそのまま貼るか、「商品名：牛乳」のような形式で貼り付けてください。'); return; }
  if(data.product_name) $('productName').value = data.product_name;
  if(data.volume) $('productVolume').value = String(data.volume).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace('．','.').replace(/[^0-9.]/g,'');
  if(data.unit) setUnitIfExists(data.unit);
  if(data.category) $('productCategory').value = data.category;
  if(data.price){
    const price = String(data.price).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace(/[^0-9.]/g,'');
    if(price && $('priceValue')) $('priceValue').value = price;
  }
  if(data.store_name && $('storeName')){ const sp = splitStoreName(data.store_name); $('storeName').value = sp.base; if($('storeBranch')) $('storeBranch').value = sp.branch; }
  if(data.date && $('priceDate')) $('priceDate').value = normalizeDateInput(data.date) || todayDateInput();
  const msg = `反映しました${data.confidence ? `（確信度：${data.confidence}）` : ''}。${autoRegister ? '製品登録まで実行します。' : '内容を確認して「製品を追加」を押してください。'}${data.notes ? ' メモ：' + data.notes : ''}`;
  $('productAiStatus').textContent = msg;
  $('productAiStatus').className = 'small copy-ok';
  document.querySelector('[data-tab="products"]')?.click();
  setTimeout(() => $('productName')?.scrollIntoView({behavior:'smooth', block:'center'}), 80);
  if(autoRegister){
    if(!($('productName')?.value || '').trim()){
      alert('商品名が読み取れませんでした。商品名だけ手入力すると登録できます。貼り付け内容に product_name または 商品名 が含まれているか確認してください。');
      return;
    }
    await addProduct();
    const hit = products.find(p => p.product_name === data.product_name) || products.find(p => p.product_name && data.product_name && (p.product_name.includes(data.product_name) || data.product_name.includes(p.product_name)));
    if(hit && $('priceProduct')) $('priceProduct').value = hit.id;
    if(data.price){ document.querySelector('[data-tab="prices"]')?.click(); setStatus('AI結果から製品を登録し、価格登録欄にも反映しました。日付・店舗・価格を確認して登録してください。','ok'); }
    else setStatus('AI結果から製品を登録しました。続けて価格登録できます。','ok');
  }else{
    setStatus('商品写真AIの結果を製品登録欄に反映しました。内容を確認してください。','ok');
  }
}

async function registerProductAiResult(){
  await applyProductAiResult(true);
}

function applyPriceAiResult(){
  const raw = $('priceAiResult')?.value || '';
  const data = normalizeAiData(extractJsonObject(raw));
  if(!data){ alert('AI結果を読み取れませんでした。JSON形式の結果を貼り付けてください。'); return; }
  if(data.price){
    const price = String(data.price).replace(/[^0-9.]/g,'');
    if(price) $('priceValue').value = price;
  }
  if(data.store_name){ const sp = splitStoreName(data.store_name); $('storeName').value = sp.base; if($('storeBranch')) $('storeBranch').value = sp.branch; }
  if(data.date && $('priceDate')) $('priceDate').value = normalizeDateInput(data.date) || todayDateInput();
  if(data.product_name && products.length){
    const hit = products.find(p => p.product_name === data.product_name) || products.find(p => data.product_name.includes(p.product_name) || p.product_name.includes(data.product_name));
    if(hit) $('priceProduct').value = hit.id;
  }
  const msg = `反映しました${data.confidence ? `（確信度：${data.confidence}）` : ''}。価格・店舗・商品を確認して登録してください。${data.tax_type ? ' 税区分：' + data.tax_type : ''}${data.notes ? ' メモ：' + data.notes : ''}`;
  $('priceAiStatus').textContent = msg;
  $('priceAiStatus').className = 'small copy-ok';
  setStatus('値札AIの結果を価格登録欄に反映しました。内容を確認してください。','ok');
}


function openUsageGuide(){
  const guide = $('usageGuidePage');
  const main = $('mainContent');
  if(!guide) return;
  main?.classList.add('hidden');
  guide.classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

function closeUsageGuide(){
  const guide = $('usageGuidePage');
  const main = $('mainContent');
  if(!guide) return;
  guide.classList.add('hidden');
  main?.classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

function setupEvents(){
  $('loginBtn')?.addEventListener('click', login);
  $('loginPassword')?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') login(); });
  $('logoutBtn')?.addEventListener('click', logout);
  $('addApprovedAccountBtn')?.addEventListener('click', addApprovedAccount);
  $('refreshApprovedAccountsBtn')?.addEventListener('click', async ()=>{ await loadApprovedAccounts(); setStatus('承認済みアカウント一覧を更新しました。','ok'); });
  $('backToTopBtn')?.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
  $('openUsageGuideBtn')?.addEventListener('click', openUsageGuide);
  $('closeUsageGuideBtn')?.addEventListener('click', closeUsageGuide);
  document.querySelectorAll('[data-guide-tab]').forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.guideTab;
    closeUsageGuide();
    document.querySelector(`[data-tab="${target}"]`)?.click();
    setTimeout(() => {
      const targetPanel = $(target);
      targetPanel?.scrollIntoView({behavior:'smooth', block:'start'});
    }, 120);
  }));
  window.addEventListener('scroll', () => { const b=$('backToTopBtn'); if(b) b.classList.toggle('show', window.scrollY > 420); });
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    const guide = $('usageGuidePage');
    const main = $('mainContent');
    guide?.classList.add('hidden');
    main?.classList.remove('hidden');
    document.querySelectorAll('.tab,.tab-panel').forEach(e => e.classList.remove('active'));
    btn.classList.add('active');
    $(btn.dataset.tab)?.classList.add('active');
    window.scrollTo({top:0, behavior:'smooth'});
  }));

  $('productCountCard')?.addEventListener('click', () => { document.querySelector('[data-tab="products"]')?.click(); $('productList')?.scrollIntoView({behavior:'smooth', block:'start'}); });
  if($('priceDate')) $('priceDate').value = todayDateInput();
  $('settingsBtn').addEventListener('click', () => $('configPanel').classList.toggle('hidden'));
  $('saveSupportBtn')?.addEventListener('click', saveSupportConfig);
  $('resetSupportBtn')?.addEventListener('click', resetSupportConfig);
  $('saveConfigBtn').addEventListener('click', async () => {
    localStorage.setItem('supabaseUrl', $('supabaseUrl').value.trim());
    localStorage.setItem('supabaseKey', $('supabaseKey').value.trim());
    localStorage.setItem('familyCode', ($('familyCode')?.value || 'default').trim() || 'default');
    localStorage.setItem('memberName', ($('memberName')?.value || currentAccount || '').trim());
    const stationValue = ($('nearestStation')?.value || '').trim();
    localStorage.setItem('nearestStation', stationValue);
    rememberStation(stationValue);
    localStorage.setItem('chatgptLink', ($('chatgptLink')?.value || '').trim());
    initSupabase();
    await loadAll();
  });
  $('clearConfigBtn').addEventListener('click', async () => {
    localStorage.removeItem('supabaseUrl');
    localStorage.removeItem('supabaseKey');
    localStorage.removeItem('nearestStation');
    localStorage.removeItem('stationHistory');
    localStorage.removeItem('chatgptLink');
    initSupabase();
    await loadAll();
  });
  $('addProductBtn').addEventListener('click', addProduct);
  $('nearestStation')?.addEventListener('input', () => { renderStationAssist(); renderStoreSuggestions(); });
  $('nearestStation')?.addEventListener('change', () => { renderStationAssist(); renderStoreSuggestions(); });
  $('productName').addEventListener('input', autoAssistProductFields);
  $('copyProductPromptBtn').addEventListener('click', () => copyText(PRODUCT_PHOTO_PROMPT, 'productAiStatus'));
  $('applyProductAiBtn').addEventListener('click', () => applyProductAiResult(false));
  $('registerProductAiBtn')?.addEventListener('click', registerProductAiResult);
  $('clearProductAiBtn').addEventListener('click', () => { $('productAiResult').value=''; $('productAiStatus').textContent=''; });
  $('cancelProductEditBtn').addEventListener('click', () => { resetProductForm(); setStatus('製品編集をキャンセルしました。','ok'); });
  $('addShoppingBtn').addEventListener('click', () => addShoppingByProduct($('shoppingProduct').value, $('shoppingQty').value));
  $('addPriceBtn').addEventListener('click', addPrice);
  $('copyPricePromptBtn').addEventListener('click', () => copyText(PRICE_TAG_PROMPT, 'priceAiStatus'));
  $('applyPriceAiBtn').addEventListener('click', applyPriceAiResult);
  $('clearPriceAiBtn').addEventListener('click', () => { $('priceAiResult').value=''; $('priceAiStatus').textContent=''; });
  $('cancelPriceEditBtn').addEventListener('click', () => { resetPriceForm(); setStatus('価格編集をキャンセルしました。','ok'); });
  $('compareBtn').addEventListener('click', compare);
  $('quickCompareBtn').addEventListener('click', quickCompare);
  $('quickCompareClearBtn').addEventListener('click', clearQuickCompare);
  $('voiceBtn').addEventListener('click', voice);
  $('openChatgptBtn')?.addEventListener('click', openChatgptLink);
  $('runDiagnosticsBtn')?.addEventListener('click', runDiagnostics);
  $('productImageInput')?.addEventListener('change', (e) => handleProductImageFile(e.target.files?.[0]));
}

setupEvents();
initSupabase();
loadAll();
