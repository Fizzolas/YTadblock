// YouTube Ad Blocker Pro - SSAI skip & black screen mitigation - v1.2.2-dev
(function() {
  'use strict';
  /* ... unchanged state/setup ... */
  // Additions below:
  let adSkippedRecently = false;
  let blackScreenAttempts = 0;
  function forciblyRestoreVideo(video) {
    if (!video) return;
    // Kick player - try play and seek
    try {
      video.play();
      video.currentTime += 0.1;
      log('Forced video player nudge after ad skip');
    } catch(e) {
      log('Video nudge error', e);
    }
  }
  function blackScreenMitigation(video) {
    if (!video) return;
    if (video.paused || video.readyState < 2 || blackScreenAttempts < 3) {
      forciblyRestoreVideo(video);
      blackScreenAttempts++;
      setTimeout(()=>{
        if(video.paused || video.readyState < 2) blackScreenMitigation(video);
      }, 1200);
    }
  }
  // Patch into the end of successful ad skip/fast-forward:
  function handleAdSkipCompleted(video) {
    // ...existing restoration/finalization...
    blackScreenAttempts = 0;
    setTimeout(()=>blackScreenMitigation(video), 600);
  }
  // Insert after each successful skip/FF:
  // log('Fast-forwarded ad from ...');
  // ...
  handleAdSkipCompleted(video);
  // ...rest unchanged...
})();
