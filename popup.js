// YT Ad Blocker Pro - Fast, Minimal Popup
// v1.3.0 - November 2025

document.addEventListener('DOMContentLoaded',()=>{
  const statusDot=document.getElementById('statusDot'),statusText=document.getElementById('statusText'),toggleBtn=document.getElementById('toggleBtn'),toggleText=document.getElementById('toggleText');
  const adsBlockedEl=document.getElementById('adsBlocked'),sponsoredBlockedEl=document.getElementById('sponsoredBlocked'),popupsRemovedEl=document.getElementById('popupsRemoved'),timeRunningEl=document.getElementById('timeRunning');
  const sessionAdsEl=document.getElementById('sessionAdsBlocked'),sessionSponEl=document.getElementById('sessionSponsoredBlocked'),sessionPopupEl=document.getElementById('sessionPopupsRemoved');
  let lastStats="";
  async function getTab(){const[t]=await chrome.tabs.query({active:true,currentWindow:true});return t;}
  function fmt(n){return n.toLocaleString();}
  async function loadAllStats(){
    const d=await chrome.storage.local.get(['adsBlocked','sponsoredBlocked','popupsRemoved','installDate']);
    let statsData=[d.adsBlocked||0,d.sponsoredBlocked||0,d.popupsRemoved||0,d.installDate?Math.floor((Date.now()-d.installDate)/86400000):0];
    [adsBlockedEl,sponsoredBlockedEl,popupsRemovedEl,timeRunningEl].forEach((e,i)=>{if(e.textContent!==fmt(statsData[i]))e.textContent=fmt(statsData[i]);});
    let sessions=['-','-','-'];
    const tab=await getTab();
    if(tab&&tab.url&&tab.url.includes('youtube.com')){try{const r=await chrome.tabs.sendMessage(tab.id,{action:'getSessionStats'});sessions=[r.adsBlocked||0,r.sponsoredBlocked||0,r.popupsRemoved||0];}catch(e){sessions=['0','0','0'];}}
    [sessionAdsEl,sessionSponEl,sessionPopupEl].forEach((e,i)=>{if(e.textContent!==fmt(sessions[i]))e.textContent=fmt(sessions[i]);});
  }
  function setStatus(active){if(active){statusDot.className='dot dot-ac';statusText.textContent='Active';toggleText.textContent='Disable';toggleBtn.className='on';}else{statusDot.className='dot';statusText.textContent='Inactive';toggleText.textContent='Enable';toggleBtn.className='off';}}
  getTab().then(tab=>{
    if(tab&&tab.url&&tab.url.includes('youtube.com')){
      chrome.tabs.sendMessage(tab.id,{action:'getStatus'}).then(r=>setStatus(r.active)).catch(()=>setStatus(true));
      toggleBtn.onclick=async()=>{try{const r=await chrome.tabs.sendMessage(tab.id,{action:'toggle'});setStatus(r.active);}catch{}}
    }else{statusText.textContent='Not on YouTube';toggleBtn.disabled=true;}
  });
  loadAllStats();setInterval(loadAllStats,1500);
});