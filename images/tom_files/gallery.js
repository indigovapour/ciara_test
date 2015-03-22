var CM = { };

/*-------------------------------- Gallery --------------------------------*/

CM.Gallery = new Class({
 constructor: function(itemInfos, showThumbnails) {
    this.element = $('#flipbook,#gallery').first();
    
    this.unit = -1; // Not yet loaded
    
    this.items = [];
    
    var base = this;
    
    var i = 0;
    
    itemInfos.forEach(function(info) {
      var item = new GalleryItem(i, info);
      
      base.items.push(item);
      
      i++;
    });
    
    this.captionEl = $('#caption');
    
    this.prevLink = this.element.find('.previousLink');
    this.nextLink = this.element.find('.nextLink');
    
    this.prevLink.on('click', this.viewPrevious.bind(this));
    this.nextLink.on('click', this.viewNext.bind(this));
    
    if(this.items.length == 1) {
      this.prevLink.hide();
      this.nextLink.hide();
    }

    this.canvasEl = this.element.find('.canvas');
    
    if(showThumbnails) {
      this.thumbStrip = new CM.Thumbnails('#thumbnails', /*stage*/ base);
    }
    
    var hash = window.location.hash;
    
    if(hash && hash.length > 1) {
      var hashValue = hash.split("#")[1];
      
      var itemIndex = parseInt(hashValue, 10) - 1;
        
      this.view(itemIndex);
    }
    else {
      this.view(0);
    }
    

    $(window).on('hashchange', this.onHashChange.bind(this));
  },
  
  onHashChange: function(e) {  
    var hash = window.location.hash;
    
    if(hash && hash.length > 1) {
      
      var hashValue = hash.split('#')[1];
      
      var itemIndex = parseInt(hashValue, 10) - 1;
          
      if(itemIndex != this.unit) {      
            
        this.view(itemIndex); 
      }
    }
  },
  
  view: function(itemIndex) {
    if(this.items.length != 0 && ((itemIndex + 1) > this.items.length)) {
      this.view(0); // LOOP
      
      return;
    }
    
    if(itemIndex == this.unit) {  
      return; // don't load again.
    }   
        
    var item = this.items[itemIndex];
        
    if(!item) {     
      return;
    }
    
    this.unit = itemIndex;
    
    window.location = "#" + item.number;
    
    var previousItem = this.items[itemIndex - 1];
    var nextItem = this.items[itemIndex + 1];
    
    if(previousItem) {
      previousItem.preload();
    }
    
    if(nextItem) {
      nextItem.preload();
    }
    
    if(itemIndex == 0) {
      this.prevLink.addClass('disabled');
    }
    else {
      this.prevLink.removeClass('disabled');
    }
    
    if((itemIndex + 1) == this.items.length) {
      this.nextLink.addClass('end');
    }
    else {
      this.nextLink.removeClass('end');
    }
    
    this.animate();
  },
  
  viewNext: function(e) {
    this.view(this.unit + 1);
    
    return false;
  },
  
  viewPrevious: function(e) {
    this.view(this.unit - 1);
    
    return false;
  },
  
  animate: function() {  
    var item = this.items[this.unit];
    
    var base = this;
    
    // Hide the caption
    this.captionEl.hide();
          
    // Hide the artwork   
    $('.artwork').css('opacity', 0);
    
    if(!item.media.isLoaded) {
      this.canvasEl.addClass('loading');
    }
    
    // Fade the image in once it loads
    item.load().then(this.onLoad.bind(this));
        
    // Set the caption
    if(item.description.length > 0) {
      this.element.removeClass('noCaption');

      this.captionEl.html(item.description);
      
      this.captionEl.show(); 
    }
  },
  
  onLoad: function(media) {
    var item = this.items[this.unit];

    if(this.thumbStrip) {           
      this.thumbStrip.selectThumbnail(this.unit);
    }

    $('.stage').removeClass('application video image swf').addClass(item.type);

    if (!media) return;

    var base = this;
    var newArtworkEl = $('<div />').attr('class', 'artwork');
    
    newArtworkEl.css({
      backgroundImage: 'url("' + media.url + '")',
      opacity: 0
    });
    
    $('.artwork').replaceWith(newArtworkEl);
      
    $('.artwork').stop().animate({ opacity: 1 }, 500, function() { 
      base.canvasEl.removeClass('loading');
    }); 
  },

  dispose: function() {
     this.prevLink.off();
     this.nextLink.off();

     $(window).off();
  }
});

var GalleryItem = new Class({
  constructor: function(index, info) {
    this.description = info.description;
    
    this.media = info.media;
    
    this.image = new Image();
    
    this.index = index;
    this.number = index + 1;
    this.isLoading = false;

    this.type = this.media.type.split('/')[0];

    this.media.isLoaded = false;
    
    if (this.media.renditions) {
      var rendition = this.media.renditions[0];
    
      this.media.width  = rendition.width;
      this.media.height = rendition.height;
      this.media.url    = rendition.url;
    }

    this.errorCount = 0;
  },
  
  showSwf: function() {
    var defer = $.Deferred();
    
    // TODO

    defer.resolve();

    return defer;
  },

  showVideo: function() {
    var defer = $.Deferred();

    var renditions = this.media.renditions;
    
    var sources = [];
    
    renditions.forEach(function(r) {            
      sources.push(new MediaSource(r.url, r.type));
    });
    
    if(this.media.poster) {
      var poster = this.media.poster.renditions[0];
                
      player.setPosterSrc(poster.url);
    }

    player.setSources(sources);
    
    player.reload();

    defer.resolve();

    return defer;
  },

  preload: function() {
    if(this.type != 'video' || this.type != 'application') {
      this.load();
    }
  },

  load: function() {
    var base = this;
    
    if (this.type == 'video') {
      return this.showVideo();
    }

    var defer = $.Deferred();
    
    if(this.media.isLoaded) {
      defer.resolve(this.media);
            
      return defer;
    }
    
    if(this.isLoading) {
      defer.resolve(this.media);
      
      return defer;
    }
    
    this.isLoading = true;    
        
    $(this.image).on('load', function() {
      base.media.isLoaded = true;
      
      defer.resolve(base.media);
    });
        
    this.image.onerror = function() {
      base.errorCount++;
      base.isLoading = false;
      
      if(base.errorCount < 2) { 
        base.load();
      }   
    };

    this.image.src = this.media.url;
    
    return defer;
  }
});

/*-------------------------------- Thumbnails --------------------------------*/

CM.Thumbnail = new Class({
  constructor: function(index, element, strip) {   
    this.element = element;
    this.index = index;
    
    this.strip = strip;
    this.stage = strip.stage;
    
    this.imageEl = element.find('img');
    
    this.width = this.imageEl.width();
    
    this.element.on('click', this.select.bind(this));
  },
  
  select: function() {
    this.strip.element.find('.selected').removeClass('selected');
    
    this.element.addClass('selected');
    
    if(this.stage) {
      if(this.stage.unit != this.index) {
        this.stage.view(this.index);
      }
    }
  },
  
  load: function() {
    if(this.imageEl.attr('src').endsWith("c.gif")) {
      this.imageEl.attr('src', this.imageEl.data('src'));
    }
  }
});

CM.Thumbnails = new Class({
  constructor: function(element, stage) {   
    this.element = $(element);
    
    this.stage = stage;
    
    this.thumbnails = [];
    
    var i = 0;
    
    this.setCount = 0;
    this.currentSet = 0;
    
    this.setEls = this.element.find('.set');
    
    var base = this;
    
    this.setEls.each(function() {
      var setEl = $(this);
      
      base.setCount++;
      
      // Remove the text nodes
      setEl.contents().filter(function() { return this.nodeType === 3; }).remove();

      setEl.find('.thumb').each(function() {
        var liEl = $(this);
        
        var thumbnail = new CM.Thumbnail(i, liEl, base);
                
        thumbnail.setNumber = base.setCount;
        
        base.thumbnails.push(thumbnail);
        
        i++;
      });
    });
        
    this.viewportEl = this.element.find('.viewport');
    this.prevEl = this.element.find('.previous');
    this.nextEl = this.element.find('.next');
    
    this.prevEl.on('click', this.loadPreviousSet.bind(this));
    this.nextEl.on('click', this.loadNextSet.bind(this));
    
    if(this.setCount == 1) {
      this.prevEl.hide();
      this.nextEl.hide();
    }  
  },
  
  selectThumbnail: function(index) {    
    var thumbnail = this.thumbnails[index];
    
    if(thumbnail) {
      thumbnail.select();
            
      this.loadSet(thumbnail.setNumber);
    }
  },
  
  loadPreviousSet: function() {
    this.loadSet(this.currentSet - 1);
  },
  
  loadNextSet: function() { 
    this.loadSet(this.currentSet + 1);
  },
  
  loadSet: function(setNumber) {
    if(!this.hasSet(setNumber) || this.currentSet == setNumber) {
      return;
    }
    
    this.currentSet = setNumber;
    
    if(setNumber == 1) {
      this.prevEl.addClass('disabled');
    }
    else {
      this.prevEl.removeClass('disabled');
    }
    
    if(this.hasSet(setNumber + 1)) {
      this.nextEl.removeClass('disabled');
    }
    else {
      this.nextEl.addClass('disabled');
    }
    
    var setEl = $(this.setEls[setNumber - 1]);
    
    if(setEl.length > 0) {      
      setEl.find('img.lazy').each(function() {
        var imgEl = $(this);
          
        imgEl.removeClass('lazy').attr('src', imgEl.data('src'));
      });
    
      this.moveTo(setEl,{ duration: 0.5 }  ); 
    }   
  },
  
  hasSet: function(setNumber) { 
    return setNumber <= this.setCount && setNumber > 0;
  },
  
  moveTo: function(element, options) {      
    var x = element.position().left;
    
    $('.viewport').stop().animate({ scrollLeft: x }, { duration: 500, easing: 'easeOutQuint' });
  }
});

// jQuery easing

jQuery.extend(jQuery.easing, {
  def: 'easeOutQuad',
  swing: function (x, t, b, c, d) { return jQuery.easing[jQuery.easing.def](x, t, b, c, d); },
  easeInQuad: function (x, t, b, c, d) { return c*(t/=d)*t + b; },
  easeOutQuad: function (x, t, b, c, d) { return -c *(t/=d)*(t-2) + b; },
  easeInOutQuad: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t + b;
    return -c/2 * ((--t)*(t-2) - 1) + b;
  },
  easeInCubic: function (x, t, b, c, d) { return c*(t/=d)*t*t + b; },
  
  easeOutCubic: function (x, t, b, c, d) { return c*((t=t/d-1)*t*t + 1) + b; },
  
  easeInOutCubic: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t + b;
    return c/2*((t-=2)*t*t + 2) + b;
  },
  easeInQuart: function (x, t, b, c, d) { return c*(t/=d)*t*t*t + b; },
  
  easeOutQuart: function (x, t, b, c, d) { return -c * ((t=t/d-1)*t*t*t - 1) + b; },
  
  easeInOutQuart: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
    return -c/2 * ((t-=2)*t*t*t - 2) + b;
  },
  easeInQuint: function (x, t, b, c, d) { return c*(t/=d)*t*t*t*t + b; },
  easeOutQuint: function (x, t, b, c, d) { return c*((t=t/d-1)*t*t*t*t + 1) + b; },
  easeInOutQuint: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
    return c/2*((t-=2)*t*t*t*t + 2) + b;
  },
  easeInSine: function (x, t, b, c, d) { return -c * Math.cos(t/d * (Math.PI/2)) + c + b; },
  easeOutSine: function (x, t, b, c, d) { return c * Math.sin(t/d * (Math.PI/2)) + b; },
  easeInOutSine: function (x, t, b, c, d) {
    return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
  },
  easeInExpo: function (x, t, b, c, d) {
    return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
  },
  easeOutExpo: function (x, t, b, c, d) {
    return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
  },
  easeInOutExpo: function (x, t, b, c, d) {
    if (t==0) return b;
    if (t==d) return b+c;
    if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
    return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
  },
  easeInCirc: function (x, t, b, c, d) {
    return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
  },
  easeOutCirc: function (x, t, b, c, d) {
    return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
  },
  easeInOutCirc: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
    return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
  },
  easeInElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
  },
  easeOutElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
  },
  easeInOutElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
    return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
  },
  easeInBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    return c*(t/=d)*t*((s+1)*t - s) + b;
  },
  easeOutBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
  },
  easeInOutBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
    return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
  },
  easeInBounce: function (x, t, b, c, d) {
    return c - jQuery.easing.easeOutBounce (x, d-t, 0, c, d) + b;
  },
  easeOutBounce: function (x, t, b, c, d) {
    if ((t/=d) < (1/2.75)) {
      return c*(7.5625*t*t) + b;
    } else if (t < (2/2.75)) {
      return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
    } else if (t < (2.5/2.75)) {
      return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
    } else {
      return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
    }
  },
  easeInOutBounce: function (x, t, b, c, d) {
    if (t < d/2) return jQuery.easing.easeInBounce (x, t*2, 0, c, d) * .5 + b;
    return jQuery.easing.easeOutBounce (x, t*2-d, 0, c, d) * .5 + c*.5 + b;
  }
});
