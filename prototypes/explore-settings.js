const definitions=[
  {key:'currentLength',label:'현재 기장',values:['귀 위','턱선','쇄골','가슴','허리'],value:2},
  {key:'hairThickness',label:'모발 굵기',values:['가늘음','보통','굵음'],value:1},
  {key:'damage',label:'손상도',values:['낮음','보통','높음'],value:1},
  {key:'permAllowed',label:'펌',values:['제외','허용'],value:1},
  {key:'extensionAllowed',label:'붙임 · 피스',values:['안 함','허용'],value:0},
  {key:'similarity',label:'유사도',values:['다양','넓게','균형','가깝게','유사'],value:2}
];
const state=Object.fromEntries(definitions.map(item=>[item.key,item.value]));
const settings=document.querySelector('#settings');
const percent=(value,max)=>max?`${value/max*100}%`:'0%';
function renderSettings(){
  settings.innerHTML=definitions.map(item=>`<section class="setting" data-key="${item.key}"><div class="setting-head"><label for="${item.key}">${item.label}</label><output id="${item.key}Value">${item.values[state[item.key]]}</output></div><input class="range" id="${item.key}" data-key="${item.key}" type="range" min="0" max="${item.values.length-1}" step="1" value="${state[item.key]}" style="--p:${percent(state[item.key],item.values.length-1)}"><div class="ends"><span>${item.values[0]}</span><span>${item.values.at(-1)}</span></div></section>`).join('');
  document.querySelectorAll('.range').forEach(input=>input.addEventListener('input',()=>{
    const item=definitions.find(definition=>definition.key===input.dataset.key),value=Number(input.value);
    state[item.key]=value;
    input.style.setProperty('--p',percent(value,item.values.length-1));
    document.querySelector(`#${item.key}Value`).textContent=item.values[value];
  }));
}
document.querySelector('#finish').addEventListener('click',()=>document.querySelector('#explore').classList.add('on'));
document.querySelector('#close').addEventListener('click',()=>document.querySelector('#explore').classList.remove('on'));
document.querySelector('#grid').innerHTML=Array.from({length:100},(_,index)=>`<div class="tile" style="animation-delay:${-(index%9)*.22}s"></div>`).join('');
renderSettings();
