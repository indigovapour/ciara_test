var player = null;

var Browser = { 
  isChrome: 		(navigator.userAgent.indexOf('Chrome') > -1),
  supportsVideo: 	(!!document.createElement('video').canPlayType),
  canPlayType: 		function(type) { return document.createElement('video').canPlayType(type); }
};

var Util = {
  getRelativePosition: function(x, relativeElement) {
      return Math.max(0, Math.min(1, (x - this.findPosX(relativeElement)) / relativeElement.offsetWidth));
  },
  
  getMouseX: function(e) {
    if (e.pageX) { 
      return e.pageX;    
    }
    else if (e.clientX) { // IE
      return e.clientX + (document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft);
    }
    else {
      return null;
    }
  },
  // Get an element's x offset on the page
  findPosX: function(element) {
      var curleft = element.offsetLeft;
      
    while(element = element.offsetParent) {
      curleft += element.offsetLeft;
    }
      
    return curleft;
  },
  
  blockTextSelection: function() {
    document.body.focus();
    document.onselectstart = function () { return false; };
  },
  
  unblockTextSelection: function() {
    document.onselectstart = function () { return true; };
  }
};

var Flash = (function() {
  function Flash() {        
    this.version = {
      text: '',
      major: -1,
      minor: -1
    }
    
    this.setVersion();
    
    this.installed = this.version.major > -1;
  }
  
  Flash.prototype.setVersion = function() {
    if(window.ActiveXObject) {
      this.setActiveXVersion();
    }
    else {          
      this.setNavigatorVersion();
    }
  };
  
  Flash.prototype.getNavigatorPlugin = function() {    
    try 		 { return navigator.plugins['Shockwave Flash']; }
    catch(e) { return null; }
  };
  
  Flash.prototype.getActiveXObject = function() {
    try 		 { return new ActiveXObject('ShockwaveFlash.ShockwaveFlash'); }
    catch(e) { return null; }
  };
  
  Flash.prototype.setActiveXVersion = function() {
    try {
      var activeXObject = this.getActiveXObject();
      
      if(activeXObject) {
        var versionText = activeXObject.GetVariable('$version');
        
        var versionArray = versionText.split(',');
               
        this.version.text = versionText;
        this.version.major = parseInt(versionArray[0].split(' ')[1], 10);
        this.version.minor = parseInt(versionArray[1], 10);
      }
    }
    catch(e) { }
   };
    
   Flash.prototype.setNavigatorVersion = function() {
   	try {
    	var navigatorPlugin = this.getNavigatorPlugin();
      
      if (navigatorPlugin) {        
        var versionText = navigatorPlugin.description;
          
        this.version.text = versionText;
        
        if(versionText.startsWith('Shockwave')) {
            var descParts = versionText.split(/ +/);
            var majorMinor = descParts[2].split(/\./);
            var revisionText = descParts[3];
                      
            this.version.major = parseInt(majorMinor[0], 10);
            this.version.minor = parseInt(majorMinor[1], 10);
        }
        else {
          var versionParts = versionText.split('.');
            
          this.version.major = parseInt(versionParts[0], 10);
          this.version.minor = parseInt(versionParts[1], 10);
        }
      }
    }
    catch(e) { }
  };
      
  return Flash;
})();

var MediaPlayers = {
  instances: [ ],
  
  setup: function() {   
    var base = this;
    
    var i = 0;
    
    var playerEls = $('.mediaPlayer');
    
    playerEls.each(function() {
      var element = $(this);
      
      var options = { 
        width: element.width(), 
        height: element.height()
      };
    
      var mediaPlayer = new MediaPlayer(element, options);

      if(mediaPlayer) {
        mediaPlayer.index = i;
        
        base.instances.push(mediaPlayer);
      
        player = mediaPlayer;
          
        i++;
      }
              
      try { $(window).on('unload', MediaPlayers.cleanup); }
      catch(e) { }

    });
  },
  cleanup: function() {
    try { player.pluginEl.remove(); }
    catch(e) { }
  }
};

var MediaSource = (function() {
  function MediaSource(url, type) { 
    this.url = url;
    this.type = type;
    
    this.canPlay = (Browser.supportsVideo && document.createElement('video').canPlayType(this.type));
  }
  
  MediaSource.prototype.toElement = function() {
  	var el = document.createElement('source');
  	
  	el.src = this.url;
  	el.type = this.type;
  	
  	return el;  	
  };

  return MediaSource;
})();

var i = 1;

var MediaPlayer = (function() { 
  function MediaPlayer(element, options) {  
    var base = this;
    
    this.element = $(element);
     
    this.movieName = 'player_' + i;
    this.autoPlay = true;
    this.state = 'uninitialized';
    
    this.ready = false;

    this.video = this.element.find('video');
    this.playOverlay = this.element.find('.playOverlay');
    this.posterEl = this.element.find('.poster');
    
    this.sources = [];
    
    this.video.find('source').each(function() {
      base.sources.push(new MediaSource(this.src, this.type));
    });
 
    this.options = {
      volume: 0.80,
      width: 768,
      height: 432
    };

    if(options && typeof options == 'object') {
      $.extend(this.options, options);
    }
    
    this.width = this.options.width;
    this.height = this.options.height;
    
    this.supportsFullscreen = !Browser.isChrome && typeof(this.video.webkitSupportsFullscreen) !== 'undefined';
          
    this.controls = new MediaPlayerControls(this);
  
    this.element.on('mouseover', Util.blockTextSelection);
    this.element.on('mouseout',  Util.unblockTextSelection);
    
    this.element.on({ 
    	'click':		 this.onClick.bind(this),
	    'mousemove': this.onMouseMove.bind(this),	// Show the controls
	    'mouseout':  this.onMouseOut.bind(this) 	// Hide the controls
	  });
	  	
    this.setup();
    
    if(this.head) {
	  	this.head.done(this.onReady.bind(this));
    }
  }
  
  MediaPlayer.prototype.setup = function() {      
    if(Browser.supportsVideo && (Browser.canPlayType('video/mp4') || Browser.canPlayType('video/webm'))) {
    	this.head = new HtmlHead(this, this.options);
    	
    	return;
    }
    
    var flash = new Flash();
    
    if(flash.installed && flash.version.major >= 10) {
    	this.head = new FlashHead(this, this.options);
    	
      this.video.hide();
    }
    else { // No flash
      this.element.addClass('unsupported');
    }
  }
  
  MediaPlayer.prototype.onReady = function() {
	 	this.element.trigger('player:ready', this);
	  
	 	this.setDefaultVolume(); // Set the default volume
  };
  
  MediaPlayer.prototype.setSources = function(sources) {
    this.sources = sources;     
  };
    
  MediaPlayer.prototype.onClick = function(e) {  	
  	var target = $(e.target);
  	
  	if(target.is('.controller') || target.parents('.controller').length > 0) return;
  	
	  this.togglePlay();  	
  };
 
  MediaPlayer.prototype.hoverIdle = function(e) {
 	  this.element.addClass('hoverIdle');
 	  
 	  this.controls.hide();
  };

  MediaPlayer.prototype.onMouseOut = function(e) {
  	this.element.removeClass('hovering hoverIdle');
  	
  	var relatedTarget = $(e.relatedTarget);
  	
  	if(relatedTarget.hasClass('controller') || relatedTarget.parents('.controller').length > 0) return;
  	
  	this.controls.hide();
  };

  MediaPlayer.prototype.onMouseMove = function(e) {  	
  	this.controls.show();
  		
    this.element.removeClass('hoverIdle').addClass('hovering');
      
    if (this.mouseMoveTimeout) clearInterval(this.mouseMoveTimeout);
    
    this.mouseMoveTimeout = setTimeout(this.hoverIdle.bind(this), 3000);    
  };  
   
  MediaPlayer.prototype.play = function() {
    this.element.removeClass('paused').addClass('played playing');
      
    this.controls.playControlEl[0].className = 'playControl pauseButton';
      
    this.controls.show();

    this.head.play();
  };
  
  MediaPlayer.prototype.pause =function() {      
    this.head.pause();
        
    this.element.removeClass('waiting playing').addClass('paused');
    
    this.controls.playControlEl[0].className = 'playControl playButton';
      
    this.controls.show();
  };
  
  MediaPlayer.prototype.reload = function() {    
    this.head.reload();
    
    this.reset();
  };

  MediaPlayer.prototype.seek = function(time) {
    this.element.addClass('seeking waiting');
    
    this.head.seek(time);
  };
  
  MediaPlayer.prototype.setVolume = function(volume) {
    var vol = parseFloat(volume);
    
    localStorage.volume = vol;

    this.head.setVolume(vol);
    
    this.controls.volumeControl.setVolume(vol);
  };
  
  MediaPlayer.prototype.setDefaultVolume = function() {
    var volumeValue = localStorage.volume || this.options.volume;
    
    // Set to stored volume OR 85%
    this.setVolume(volumeValue);
  };
  
  MediaPlayer.prototype.setPosterSrc = function(src) {   
    this.posterEl.css('backgroundImage', 'url("' + src + '")');
  };
  
  MediaPlayer.prototype.reset = function() {    
    this.element.removeClass('played playing seeking paused waiting');
        
    this.controls.reset();
  };
  
  MediaPlayer.prototype.enterFullscreen = function() {
  	if(!this.video.webkitSupportsFullscreen) return;
  	  
  	this.video.webkitEnterFullScreen(); 
  };
  
  MediaPlayer.prototype.togglePlay = function() {    
    if(this.head.paused) {
      this.play();
    }
    else {
      this.pause();
    }
  };
    
  MediaPlayer.prototype.onLoadProgress = function(progress) {
    this.controls.scrubber.setLoadProgress(progress);   
  };
  
  MediaPlayer.prototype.onCurrentTimeChange = function(time) {    
    this.controls.scrubber.setCurrentTime(time);
    
    this.element.removeClass('waiting');
  };
  
  MediaPlayer.prototype.onFullscreen = function() {
    this.element.addClass('fullscreen');    
  };
    
  MediaPlayer.prototype.onWaiting = function () {
	  this.element.addClass('waiting');
  }
    
  return MediaPlayer;
})();

function debug(message) {	
	return;
	
	// alert(message);
	
	try { console.log(message); }
	catch(e) { }
}

var FlashHead = (function() {
  function FlashHead(player) {   
  	this.player = player;
  	
    this.player.video.hide(); // Hide the native video element
        
    this.pluginPlaceholder = this.player.element.find('.fallback');
  
    this.options = player.options;
    this.duration = 0;
    this.currentTime = 0;
    this.paused = true;
    
    this.movieName = 'player_1';
    this.ready = false;
                      
    var objectHtml = this.getPluginHTML();
    
    this.pluginPlaceholder.html(objectHtml);
    
    this.pluginEl = document.getElementById(this.movieName);
    
    var base = this;
    
    $(this.pluginEl).on({
    	'mousemove': base.player.onMouseMove.bind(base),
    	'mouseout': base.player.onMouseOut.bind(base)
    });
    
	  this.cache = {
	  	url: null,
	    playState: null
	  };
	  
	  this.defer = new $.Deferred();
   
    this.defer.promise(this);
  }
  
  FlashHead.prototype.getPluginHTML = function () {
    this.autoPlay = false;
        
    var vars = {
      url: this.player.sources[0].url,
      backgroundColor: '0x000000',
      width: this.options.width,
      height: this.options.height,
      autoPlay: this.autoPlay,
      playerRef: 'player.head'
    };
    
    var windowMode = 'opaque';
    var pluginSrc = 'http://s.cmcdn.net/scripts/player/2011-02-01.swf';
    
    if ($.browser.msie) pluginSrc += '?' + new Date().getTime();
    
    return [
      '<object',
        ' id="', this.movieName, '"',
        ' name="', this.movieName, '"',
        ' type="application/x-shockwave-flash"',
        ' data="', pluginSrc, '"',
        ' width="', this.options.width, '"', 
        ' height="', this.options.height, '"',
      '>',
      
        '<param name="wmode" value="opaque" />',
        '<param name="movie" value="', pluginSrc, '" />',
        '<param name="quality" value="high" />',
        '<param name="menu" value="false" />',
        '<param name="allowScriptAccess" value="always" />',
        '<param name="flashvars" value="' + $.param(vars) + '" />',
      '</object>'
    ].join("");
  };
  
  FlashHead.prototype.callFlash = function(functionName, argument) { 
    try {
      (argument != null) ? this.pluginEl[functionName](argument) : this.pluginEl[functionName]();
    }
    catch (ex) {
      debug("Error calling flash function '" + functionName + "': " + ex.message);
    }
  };
  
  FlashHead.prototype.callback = function (functionName, arg) {  	
    if (this[functionName] != null) {
      try {
        arg != null ? this[functionName](arg) : this[functionName]();
      }
      catch (ex) {
        debug("Error calling player function '" + functionName + "': " + ex.message);
      }
    }
  };
  
  FlashHead.prototype.reload = function() {       
  	this.paused = true;
  	
  	var url = this.player.sources[0].url;
  	
  	if (this.ready) { 
    	this.loadUrl(url);
    }
    else {
	    this.cache.url = url;
    }
  };

  FlashHead.prototype.loadUrl = function(url) {
  	
  	console.log('called loadUrl:' + url);
  	
  	this.callFlash('_loadUrl', url);
  };
  
  FlashHead.prototype.play = function() {
  	this.paused = false;
  	
    if (this.ready) {
      this.callFlash('_play');
    }
      
    else this.cache.playState = 'play';
    
    return this;
  };
  
  FlashHead.prototype.pause = function() {
  	this.paused = true;
  	
    if (this.ready) {
      this.callFlash('_pause');
    }
    else {
      this.cache.playState = 'pause';
    }
  };
  
  FlashHead.prototype.setVolume = function(level) {
    if (this.ready) {
      this.callFlash('_setVolume', level);
    }
    else { 
      this.cache.volume = level;
    }
  };
  
  FlashHead.prototype.seek = function(time)  {
    if (this.ready) {
      this.callFlash('_seek', time);
    }
    else {
    	this.cache.seek = time;
    }
  };
  
  FlashHead.prototype.onCurrentTimeChange = function(time) {
	  this.currentTime = time;
	  
	  this.player.onCurrentTimeChange(time);
  }
    
  FlashHead.prototype.onDebug = function( message ) {
    debug('onDebug: ' + message);
  };
  
  FlashHead.prototype.onJsReady =function() {
   // Phase out 
  };
  
  FlashHead.prototype.onPlayerStateChange = function(state) {
  	// uninitialized, loading, ready
    debug('onPlayerStateChange: ' + state);
    
    this.state = state;

  	this.ready = true;
    
	  this.defer.resolve();
	     
	  // Load the url
	  
	  if (this.cache.url) {
	  	var url = this.cache.url;
	  	
	  	this.cache.url = null;
	  	
			this.loadUrl(url); 
		}

  };
  
  FlashHead.prototype.onLoadProgress = function(progress) {
    debug('onLoadProgress: ' + progress);
    
    this.player.onLoadProgress(progress);
  };
  
  FlashHead.prototype.onMediaError = function( error ) {            
    debug('onMediaError: ' + error.errorID + ',' + error.message + ',' + error.detail);
  };
   
  FlashHead.prototype.onComplete = function() {
    debug('onComplete');
  };
  
  FlashHead.prototype.onDurationChange = function(time) {
    debug('onDurationChange: ' + time);
    
    if(time != NaN) {
    	this.duration = time;
    }
  };
  
  FlashHead.prototype.onVolumeChange = function( level ) {
    debug('onVolumeChange: ' + level);
  };
  
  FlashHead.prototype.onBufferingChange = function(isBuffering) {
    debug('onBufferingChange: ' + isBuffering);

    if(isBuffering) this.player.onWaiting();
   };
   
   return FlashHead;
})();

var HtmlHead = (function() {
  function HtmlHead(player) {
  	this.player = player;
  	
  	// The video element
  	this.element = this.player.video[0];
  	 
  	$(this.element).on({	
  		'durationchange': 	this.onDurationChange.bind(this),
  		'error': 						this.onError.bind(this),
  		'loadedmetadata': 	this.onLoadedMetadata.bind(this),
  		'progress': 				this.onProgress.bind(this),
  		'timeupdate': 			this.onTimeUpdate.bind(this)
  	});
  	    
  	// Hide the default browser controls
    this.element.controls = false;
    
    this.errorCount = 0;
    
    // Aliases for FF4, IE9, Safari 5, Chrome 5                           
    Object.defineProperty(this, 'paused',  			{ get : function() { return this.element.paused;  } });
  	Object.defineProperty(this, 'ended', 	 			{ get : function() { return this.element.ended;   } });
  	Object.defineProperty(this, 'seeking', 			{ get : function() { return this.element.seeking; } });
  	Object.defineProperty(this, 'currentTime', 	{ get : function() { return this.element.currentTime; } });
                             
    this.defer = new $.Deferred();
   
    this.defer.promise(this);
    
    this.defer.resolve();
  };
  
  HtmlHead.prototype.play = function() 	{ 
  	this.element.play(); 
  };
  
  HtmlHead.prototype.pause = function() { 
  	this.element.pause(); 
  };
  
  HtmlHead.prototype.seek = function(time /*in seconds */) {    
    this.element.currentTime = time;
  };
  
  HtmlHead.prototype.setVolume = function(value) {
	  this.element.volume = parseFloat(value);
  };
  
  HtmlHead.prototype.reload = function() {
    var base = this;
    
    this.errorCount = 0;
    
    this.element.pause();
    
    $(this.element).empty();
    
    this.player.sources.forEach(function(source) {    
    	base.element.appendChild(source.toElement());
    });
    
    this.element.load(); // begin loading the media from the server
  };

  HtmlHead.prototype.onDurationChange = function(e) {     
    this.duration = this.element.duration;
  };
  
  HtmlHead.prototype.onError = function(e) {
    this.errorCount++;
    
    var base = this;
    
    var error = e.target.error;
      
    if(error && error.code == 4 && this.errorCount < 2) {   
      setTimeout(function() { element.video.load(); }, 4000);
    }   
  };
    
  HtmlHead.prototype.onLoadedMetadata = function(e) {   
    this.duration = this.element.duration;
  };
  
  HtmlHead.prototype.onProgress = function(e) {
    var buffered = this.element.buffered;
    
    if (!(buffered && buffered.length >= 1)) return;
    
    var bufferedTime = buffered.end(0);
    
    this.player.onLoadProgress(this.element.duration / bufferedTime);
  };
  
  HtmlHead.prototype.onTimeUpdate 	= function(e) {
    if(this.element.controls) {
    	this.element.controls = false; 
    }
    
    this.player.onCurrentTimeChange(this.element.currentTime);
  };
  
  return HtmlHead;
})();


var MediaPlayerControls = (function() {
  function MediaPlayerControls(player) {
    this.player = player;
    
    this.element = this.player.element.find('.controller');
    
    this.isHidden = true;
      
    this.scrubberEl = this.element.find('.scrubber');
    this.playControlEl = this.element.find('.playControl');
    this.volumeControlEl = this.element.find('.volumeControl');
    this.fullscreenControlEl = this.element.find('.fullscreenControl');
    
    this.scrubber = new Scrubber(
      /*element*/ this.scrubberEl,
      /*controls*/ this
    );
      
    this.volumeControl = new VolumeControl(
      /*element*/ this.volumeControlEl,
      /*controls*/ this
    )
    
    if(!this.player.supportsFullscreen) {
      this.fullscreenControlEl.hide();
    }
    
    this.playControlEl.on('click', 				this.onPlayControlClick.bind(this));
    this.fullscreenControlEl.on('click', 	this.onFullscreenControlClick.bind(this));
    
    this.width = this.player.width;
    
    // this.element.style.width = '800px';

    this.scrubber.setup();
  };
  
  MediaPlayerControls.prototype.reset = function() {
    this.scrubber.reset();
  };
  
  MediaPlayerControls.prototype.show = function() {
    this.element.show();
    
    this.isHidden = false;
  };
  
  MediaPlayerControls.prototype.hide = function() {
    var base = this;
    
    this.element.hide();
      
    this.isHidden = true;
  };
  
  MediaPlayerControls.prototype.onPlayControlClick = function(e) {       
    this.player.togglePlay();
    
    return false;
  };
  
  MediaPlayerControls.prototype.onFullscreenControlClick = function(e) {    
    this.player.enterFullscreen();
    
    return false;
  };
  
  return MediaPlayerControls;
})();

// DurationBar, LoadBar, PlayBar
var Bar = (function() { 
  function Bar(element) {
    this.element = $(element);
  }
  
  Bar.prototype.reset = function() {
    this.setProgress(0);
  };
  
  Bar.prototype.setProgress = function(percent) {
    this.element.width((percent * 100) + '%');
  };
  
  return Bar;
})();

var Scrubber = (function() {
  function Scrubber(element, controls) {
    this.element = element;
    this.controls = controls;
      
    this.player = this.controls.player;
    
    this.scrubberBarEl = this.element.find('.scrubberBar');
    
    this.loadBar = new Bar(this.scrubberBarEl.find('.loadBar'));
    this.playBar = new Bar(this.scrubberBarEl.find('.playBar'));
    
    this.scrubberBarEl.on('mousedown', this.onMouseDown.bind(this));
    this.scrubberBarEl.on('mouseup', this.onMouseUp.bind(this));
  };
  
  Scrubber.prototype.setup = function() {       
    var barWidth = this.controls.width - 96;
    
    // HACK
    if(this.controls.width == 800) {
      barWidth -= 30;
    }
    
    if(this.controls.player.supportsFullscreen) {
      barWidth -= 40;
    }
    
    if(barWidth > 0) {
      // Stretch the bar to the remaining control width
        this.element.width(barWidth + 'px');
        
        // Add 20 pixels of padding to the right
        this.scrubberBarEl.width((barWidth - 20) + 'px');
      }
  };
  
  Scrubber.prototype.reset = function() {
     this.playBar.reset();
     this.loadBar.reset();
  };
    
  Scrubber.prototype.setLoadProgress = function(percent) {
    this.loadBar.setProgress(percent);
  };
  
  Scrubber.prototype.setPlayProgressWithEvent = function(e) { 
    if(!e) return;
    
    var progress = Util.getRelativePosition(Util.getMouseX(e), this.scrubberBarEl[0]);
  
    var seconds = progress * this.player.head.duration;
      
    this.player.seek(seconds);
       
    this.playBar.setProgress(progress);
  };
  
  Scrubber.prototype.setCurrentTime = function(time) {
    if(!this.player.head.duration) return;
    
    var playPercent = (time / this.player.head.duration);
       
    this.playBar.setProgress(playPercent);
  };
  
  Scrubber.prototype.onMouseDown = function(e) {
    e.stopPropagation();
        
    if (this.player.head.paused) {    	
      this.videoWasPlaying = false;
    } 
    else {
      this.videoWasPlaying = true;
      
      this.player.pause();
    }
    
    var doc = $(document);
    
    doc.on('mouseup', this.onMouseUp.bind(this));     
    doc.on('mousemove', this.setPlayProgressWithEvent.bind(this));
  };
  
  Scrubber.prototype.onMouseUp = function(e) {    
    $(document).off('mousemove mouseup');
    
    this.setPlayProgressWithEvent(e);          

    if (this.videoWasPlaying) {
    	this.player.play();
    }
  };
  
  return Scrubber;
})();

var VolumeControl = (function() {
  function VolumeControl(element, controls) {
    this.element = element; // .volumeControl
    this.controls = controls;
    this.player = this.controls.player;
    
    this.barsUl = this.element.find('ul');
    
    // Observe drag events on the volume control
    this.element.on({
    	'mousedown': this.onMouseDown.bind(this),
    	'mouseup': 	 this.onMouseUp.bind(this)
    });
  }
  
  VolumeControl.prototype.onMouseDown = function(e) {        
    $(document).on({ 
    	'mousemove': 	this.setVolumeWithEvent.bind(this),
    	'mouseup': 		function() { $(document).off('mousemove mouseup'); }
    });
  };
  
  VolumeControl.prototype.onMouseUp = function(e) {
    this.setVolumeWithEvent(e);
  };
  
  VolumeControl.prototype.setVolume =  function(volume) {
    var volNum = Math.ceil(volume * 6);
      
    for(var i=0; i<6; i++) {
      var barEl = this.barsUl[0].children[i];

      barEl.className = (i < volNum) ? "on" : "off";
    }
  };
  
  VolumeControl.prototype.setVolumeWithEvent = function(e) { 
    if(!e) return; 
    
    var newVol = Util.getRelativePosition(Util.getMouseX(e), this.element[0]);
      
    this.player.setVolume(newVol);
  };
  
  return VolumeControl;
})();