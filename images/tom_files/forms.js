/* Copyright 2010-2014 Jason Nelson (@iamcarbon)
   Free to use and modify under the MIT licence

   Requires:
   >= jQuery 1.11
   >= Chrome 10, FF 4, IE8, Safari 5
*/

"use strict";

if(window.Carbon === undefined) {
  window.Carbon = { };
}

// Ensure Carbon Reactive exists
if (Carbon.Reactive === undefined) {
  Carbon.Reactive = Class({ 
    trigger : function() { },
    observe : function() { }
  });
}

(function() {
  Carbon.EditBlock = new Class({
    statics: {
      get: function(el) {
        return $(el).data('controller') || new Carbon.EditBlock(el);
      },

      formatters: { 
        standard: function(response) { 
          var defer = $.Deferred();

          if (this.form.fields.length == 0) {
            defer.resolve('');

            return defer;
          }

          var field = this.form.fields[0];

          if (field.type == 'password') defer.resolve('••••••');
          else                          defer.resolve(field.val());
        
          return defer;
        }
      }
    },

    constructor: function(element) {      
      this.element = $(element);

      if (this.element.length == 0)        throw new Error("editBlock element not found");
      if (this.element.data('controller')) throw new Error('editBlock is already setup');

      this.name = this.element.attr('name');

      this.editing = false;

      this.saveButton   = this.element.find('.save:first');
      this.cancelButton = this.element.find('.cancel:first');
      
      this.cancelButton.click(this.cancel.bind(this));
         
      this.element.click(this.edit.bind(this));

      this.form = new Carbon.Form(this.element.find('form:first'));

      this.form.element.on('submit', this.onSubmit.bind(this));

      this.element.data('controller', this);

      this.data = this.element.data();

      this.formatter = (this.data.formatter !== undefined) 
        ? Carbon.EditBlock.formatters[this.data.formatter] 
        : Carbon.EditBlock.formatters.standard;
      
      this.element.addClass('setup');

      this.reactive = new Carbon.Reactive();
    },

    on: function(name, callback) {
      if(callback === undefined) {
        this.element.on(name);
      }
      else {
       this.element.on(name, callback);  
      }
    },
    
    off: function(name) {
      this.element.off(name);
    },

    edit: function(e) {      
      if (this.element.hasClass('editing') 
       || this.element.hasClass('disabled')) return;

      // Observe input
      this.element.on({
        changed : this.onChanged.bind(this)
      });

  
      if (e && e.target) {
        // TODO: Remove this concern

        var target = $(e.target);

        if (target.hasClass('action')  || 
            target.hasClass('destroy') || 
            target.hasClass('handle')) {
          return;
        }
      }
      
      this.editing = true;
      
      // Close other editing blocks
      $('.editBlock.editing').each(function() {
        $(this).data('controller').close();
      });

      this.element.addClass('editing');
      
      var fieldSelected = false;

      this.takeSnapshot();

      for (var i = 0, len = this.form.fields.length; i < len; i++) {
        var field = this.form.fields[i];
      
        field.input.element.trigger('poke');

        if (!fieldSelected && field.autoSelect) { 
          field.select();

          fieldSelected = true;
        }
      }

      this.element.trigger('editing', this);
    },

    observe: function(callback, options) {
      return this.reactive.observe(callback, options);
    },

    cancel: function(e) {  
      this.revertToSnapshot();
      
      this.element.trigger('canceled');

      this.close(e, true);
    },

    close: function(e, canceled) {
      this.editing = false;

      this.element.removeClass('editing');

      this.element.off('changed selection');

      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      if (this.data.previewHeight) {
        var textEl = this.element.find('.text');
        var populatedGuts = this.element.find('.populatedGuts');

        if (textEl.height() > this.data.previewHeight) {
          populatedGuts.addClass('truncated');
        }
        else {
          populatedGuts.removeClass('truncated');
        }
      }

      if (canceled) this.element.removeClass('changed');

      var n = {
        type     : 'closed',
        canceled : canceled,
        changed  : this.element.hasClass('changed')
      };

      this.element.trigger(n, this);
      this.reactive.trigger(n);
    },

    setValue: function(value) {      
      var field = this.form.fields[0];
      
      field.setValue(value);

      this.setPreviewHtml(value);
    },

    setPreviewHtml: function(value) {
      if (value.empty()) {
        this.element.addClass('empty').removeClass('populated');
      } 
      else {
        this.element.removeClass('empty').addClass('populated');
      }      

      this.element.find('.text').html(value);
    },

    onSubmit: function(e) {
      return this.save(e);
    },

    onChanged: function(e) {     
      this.element.addClass('changed');

      this.reactive.trigger({
        type  : 'input',
        name  : e.name,
        value : e.value
      });
    },

    save: function(e) {      
      // Just close if they didn't make any changes (and are not adding)
      if (!this.element.hasClass('changed') && !this.element.hasClass('adding')) {
        this.close();

        return;
      }

      if (this.onSave) {
        var result = this.onSave();

        if(result === false) return false;
        if(result === true)  return true;
      }

      if (this.form.element.hasClass('passthrough')) return;

      this.element.addClass('saving').removeClass('changed');

      this.element.trigger('saving', this);
      
      var base = this;
       
      this.form.validate(function() {
        base.ajax = base.form.send(
          /*success*/ base.onSaved.bind(base),
          /*failure*/ base.onFail.bind(base)
        );
      });
      
      return false;
    },
    
    onFail: function(xhr) {
      this.element.trigger('fail', this);
            
      this.element.removeClass('valid').addClass('invalid');
    },

    onSaved: function(data, xhr) {
      var base = this;

      this.element.removeClass('invalid saving changed new').addClass('valid saved');
      
      var formatted = this.formatter.bind(this)(data);

      this.takeSnapshot();
      
      this.element.removeClass('changed');

      var created = xhr && xhr.status == 201;

      if(created) {
        this.element.removeClass('adding');
      }

      var n = {
        type    : 'saved',
        data    : data,
        created : created
      };

      this.reactive.trigger(n);

      this.element.trigger(n, data);

      formatted.done(function(text) {
        base.setPreviewHtml(text);

        base.close();

        base.element.trigger('formatted');
      });
    },

    remove: function() {     
      this.element.trigger('removing', this);

      this.dispose();

      this.element.remove();

      this.reactive.trigger({ type : 'removed' });
    },

    takeSnapshot: function() {
      this.form.fields.forEach(function(field) {
        field.savedValue = field.getValue();
      });
    },

    revertToSnapshot: function() {
      this.form.fields.forEach(function(field) {
        field.setValue(field.savedValue);
      });
    },

    dispose: function() {
      this.element.off();

      this.element.find("*").off();
    }
  });

  Carbon.Form = new Class({
    statics: {
      get: function(el) {
        return $(el).data('controller') || new Carbon.Form(el);
      }
    },

    constructor: function(element) {
      this.element = $(element);
      
      if (this.element.length == 0) {         
        throw new Error("Form element not found");
      }

      this.data = this.element.data();
      this.name = this.element.attr('name');
      this.valid = true;
      this.focusInvalidField = true;
      
      this.element.attr('novalidate', 'true');

      this.fields = $.map(this.element[0].querySelectorAll('carbon-field, .field'), function(el) {
        return new Carbon.Field(el);
      });
      
      if(this.element.hasClass('passthrough')) return;

      this.element.on('submit', this.onSubmit.bind(this));
      this.element.addClass('setup');
      
      this.element.data('controller', this);

      var base = this;

      if (this.data.validateMode == 'immediate') {
        this.fields.forEach(function(field) {

          if (!field.validateMode) field.validateMode = 'immediate';
        });

        this.element.on('validated', 'carbon-field', function() { 
          var invalidFields = base.fields.filter(function(f) { return !f.valid; });

          if (invalidFields.length == 0) {
            base.element.addClass('valid').removeClass('invalid');
          }
          else {
            base.element.addClass('invalid').removeClass('valid');
          }
        })
      }

      this.element.triggerHandler('setup', this);

      this.status = 0; // unknown   
    },
    
    on: function(name, callback) {
      if(callback === undefined) {
        this.element.on(name);
      }
      else {
       this.element.on(name, callback);  
      }
    },
    
    off: function(name) {
      this.element.off(name);
    },
    
    onSubmit: function(e) {
      e.preventDefault();

      if(this.status == 1) return;

      var base = this;

      if (this.element.data('ajax') && this.element.data('validate') == 'remote') {
        this.send();

        return;
      }

      this.validate(function() {      
        if(base.element.data('ajax')) {
          base.send();
        }
      });
    },

    fillIn: function(data) {
      var value;
      var field;
      
      for(var key in data) {
        value = data[key];
                
        // TODO: Nested keys
        
        field = this.getField(key);
        
        if (field) { field.val(value); }
      }
    },

    validate: function(onSuccess, onError) {
      var base = this;
      var d = new $.Deferred();
      
      this.element.addClass('validating');

      var unvalidatedFields = this.fields.filter(function(f) { return !f.validated; });
      
      $.when.apply(this, unvalidatedFields.map(function(f) { return f.validate(); }))
        .then(function() {
          base.element.removeClass('validating').addClass('validated');
          
          base.invalidFields = base.fields.filter(function(f) { return !f.valid; });
          
          base.valid = base.invalidFields.length == 0;
          
          if (base.valid) {
            base.element.addClass('valid').removeClass('invalid');

             if(onSuccess) { onSuccess(); }
          } 
          else {
            base.element.addClass('invalid').removeClass('valid');
            
            if( !base.focusInvalidField) {
              base.invalidFields[0].select();
            }

            if (onError) { onError(); }
          }
          
          d.resolve();
          
          base.element.triggerHandler({
            type    : 'validated',
            valid   : base.valid
          });
        });
      
      return d;
    },

    send: function(onSuccess, onError) {
      if(this.status == 1) return;

      this.sendDate = new Date().getTime();

      this.status = 1; // sending
      
      this.element.addClass('sending');

      this.element.trigger('sending', this);
      
      var data, contentType;
      
      if (this.element.attr('enctype') == 'application/json') {
        var json = { };

        this.fields.forEach(function(field) {
          json[field.name] = field.val();
        });

        contentType = 'application/json; charset=UTF-8';

        data = JSON.stringify(json);
      }
      else { 
        data = this.element.serialize();
        contentType = 'application/x-www-form-urlencoded; charset=UTF-8';

        this.fields.forEach(function(field) {
          if (field.wysiwyg) { 
            data += "&" + field.name + "=" + escape(field.val());
          }
        });
      }

      this.ajax = $.ajax({
        method      : this.element.attr('method') || 'POST',
        url         : this.element.attr('action'),
        contentType : contentType,
        data        : data,
        dataType    : 'json'
      });
      
      var base = this;

      this.ajax.done(function(data, textStatus, xhr) {
        base.onSent(data);

        if (onSuccess) { onSuccess(data, xhr); }
      });

      this.ajax.fail(function(xhr) {
        base.onFail(xhr);

        // TODO: Formalize error data
        if (onError) { onError(xhr); }
      });

      return this.ajax;
    },
    
    onFail: function(xhr) {      
      this.status = 5; // failed
      
      var base = this;
      var elapsed = new Date().getTime() - this.sendDate;
      
      this.element.removeClass('sending');
      
      var response = JSON.parse(xhr.responseText);
      
      var errors = response.errors;
      
      if(errors) {
        errors.forEach(function(error) {

          if(error.key) { // field error
            var field = base.getField(error.key);
          
            if(field) {
              field.errors = [];
              field.addError(error);
              field.setState('invalid');
            }
          }
          else { // overall error
            base.setError(error);      
          }
        });
      
        this.invalidFields = this.fields.filter(function(f) { return !f.valid; });
        
        this.valid = this.invalidFields.length == 0;
            
        if(this.valid) {
          this.element.addClass('valid').removeClass('invalid');
        } 
        else {
          this.element.addClass('invalid').removeClass('valid');
              
          this.invalidFields[0].select();
        }
      }
       
      this.element.triggerHandler('fail');
    },

    setError: function(error) {
      this.element.addClass('error');

      var errorEl = this.element.find('.error');

      if(errorEl.length > 0) {
        errorEl.find('.message').html(error.message);

        if(error.description) {
          errorEl.addClass('hasDescription');

          errorEl.find('.description').html(error.description);
        }
      }

      this.element.triggerHandler('error', error);      
    },
        
    getField: function(name) {
      var slug = name.toLowerCase();
      
      var matches = this.fields.filter(function(f) { return f.slug == slug; });
      
      if(matches.length == 0) return null;
      
      return matches[0];
    },
    
    onSent: function(data) {      
      this.status = 2; // sent

      if (data.redirect) {
        window.location = data.redirect.url;

        return;
      }

      this.element.removeClass('sending error').addClass('sent');
      
      this.element.trigger('sent', data);
    },

    invalidate: function(clear) {
      this.validated = false;

      this.element.removeClass('valid invalid validating saved');

      this.fields.forEach(function(field) {
        field.validated = false;
        
        if(clear) {
          field.val('');
        }

        field.element.removeClass('valid invalid');
      });
      
      this.invalidFields = [ ];
    },

    reset: function(clear) {
      this.invalidate(clear);
    },

    dispose: function() {
      this.element.removeData('controller');

      this.element.off();
      this.element.find('*').off();

      this.removeClass('setup');
    }
  });

  Carbon.Field = new Class({
    constructor: function(element) {
      this.element    = $(element);
      this.name       = this.element.attr('name') || this.element.data('name');
      this.autoSelect = this.element.hasClass('autoSelect');
      this.wysiwyg    = false;
      this.messageEl  = this.element.find('.message:first');

      var inputEl = this.element.find('input:first');

      if (inputEl.length > 0) {
        this.input = (this.type === 'checkbox') 
          ? new Carbon.HtmlCheckbox(inputEl) 
          : new Carbon.HtmlInput(inputEl);
      } 
      else if (this.element.find('textarea').length) {
        this.input = new Carbon.HtmlInput(this.element.find('textarea:first'));
      } 
      else if (this.element.find('select').length) {
        this.input = new HtmlSelect(this.element.find('select:first'));
      } 
      else {
        this.wysiwyg = true;
        this.input = new Carbon.WISWIGInput(this.element.find('.input:first'));
      }

      if (!this.input) throw new Error('Input element not found');

      this.type         = this.input.type;
      this.autoFocus    = this.input.element.attr('autofocus');
      this.minLength    = this.input.minLength || 0;
      this.maxLength    = this.input.maxLength || 100000;
      this.required     = this.input.required;
      this.sameAs       = this.input.sameAs;
      this.validated    = false;
      this.validating   = false;
      this.validators   = [];
      this.restrictions = [];
      this.errors       = [];
    
      this.validateMode = this.element.data('validateMode');

      if (!this.name) this.name = this.input.name;

      if(this.autoFocus && this.input.isActive()) {
        this.element.addClass('focused');
      }

      this.input.element.on({
        blur     : this.onBlur.bind(this),
        focus    : this.onFocus.bind(this),
        input    : this.onChanged.bind(this),
        keypress : this.onKeyPress.bind(this)
      });
              
      if (this.input.supportsChange) {
        this.input.element.on('change', this.onChanged.bind(this));
      }
      
      // Set the default state
      if(this.val()) {
        this.element.removeClass('empty');  
      }
      else {
        this.element.addClass('empty');
      }
      
      this.validateRemote    = this.input.validateRemote;
      this.validateFrequency = this.input.validateFrequency;

      if (this.input.restrict) {
        switch(this.input.restrict) {
          case 'number': this.restrictions.push(InputRestriction.Number); break;
        }
      }

      if (this.validateRemote) {
        this.validators.push(new RemoteValidator(this.validateRemote));
      }
      
      switch(this.type) {
        case 'email'            : this.validators.push(new EmailAddressValidator());              break;
        case 'url'              : this.validators.push(new UrlValidator(this.input.autoCorrect)); break;
        case 'creditcardnumber' : this.validators.push(new CreditCardNumberValidator());          break;
      }
      
      if (this.minLength > 0) {
        this.validators.push(new StringLengthValidator(this.minLength, this.maxLength));
      }
      
      this.slug = (this.name) ? this.name.toLowerCase() : null;
            
      if(this.required) {  
        this.element.addClass('required');
      }

      // Suggestions
      var suggestions = this.element.find('.suggestions');

      if(suggestions.length > 0) {
        this.suggestor = new Carbon.AutoComplete(this.element);
      }
      
      this.element.data({
        controller : this,
        setup      : true
      });

      var base = this;

      if(this.element.data('countdownCharacters')) {
        var left = base.maxLength - base.val().length;

        base.element.find('.charactersLeft').text(left);

        this.input.element.on('input', function() {
          var left = base.maxLength - base.val().length;

          base.element.find('.charactersLeft').text(left);
        });
      }

      // Validate immediately if populated
      if (this.val()) {
        this.validate();
      }

      this.element.trigger('setup', this);
    },

    onKeyPress: function(e) {
      // Enforce the restrictions
      for(var i = 0; i < this.restrictions.length; i++) {
        var result = this.restrictions[i](e);

        if (result) e.preventDefault(); return;
      }
    },
        
    focus: function() {
      this.input.focus();
    },

    select: function() {
      this.input.select();  
    },
      
    // Match jQuery
    val: function(value) {
      if (value) {        
        if (this.getValue() != value) {
          this.setValue(value);
        }
      }
      else {
        return this.getValue();
      }
    },

    getSelection: function() {
      return this.input.getSelection();
    },
    
    hasSelection: function() {
      var selection = this.getSelection();

      return selection[0] !== selection[1];
    },

    getValue: function() {
      return this.input.getValue();
    },

    setValue: function(value) {
      this.input.setValue(value);

      this.onChanged({ keyCode: 0 });
    },

    onBlur: function() { 
      setTimeout(function() {
        if (!this.validated) this.validate();

        this.element.removeClass('focused');
      }.bind(this), 1);
    },
    
    onFocus: function() {
      this.element.addClass('focused');
    },

    invalidate: function() {
      this.validated = false;
      
      this.element.removeClass('valid invalid');
    },

    onChanged: function(e) {      
      if (e.keyCode == 9) return;

      this.invalidate();
      
      var val = this.getValue();
      var empty = val.length == 0;

      this.element[(empty ? 'add' : 'remove') + 'Class']('empty');
            
      if (this.input.checkbox) {
        var checked = this.input.element[0].checked;
        
        this.element[(checked ? 'add' : 'remove') + 'Class']('checked');
      }
      
      if(this.type == 'creditcardnumber') {
        this.detectCreditCardType(val);
      }
      
      this.validated = false;
      
      if (this.validateFrequency) {
        if (this.c) {
          this.c();
        } 
        else {
          this.c = this.validate.bind(this).debounce(this.validateFrequency);
        }
      }

      // Trigger event
      this.element.trigger({
        type  : 'changed',
        name  : this.name,
        value : val
      }, this);

      if (this.validateMode == 'immediate') {
        this.validate();
      }
    },

    detectCreditCardType: function(val) {
      var ccTypeMap = { 
        '4': 'visa', 
        '5': 'masterCard',
        '3': 'americanExpress', 
        '6': 'discover' 
      };

      var type = (val && val.length) ? ccTypeMap[val[0]] : null;
    
      if (!type || !this.element.hasClass(type)) {               
        this.element.removeClass('visa masterCard americanExpress discover').addClass(type);
        
        this.element.trigger('creditCardTypeChanged', type);
      }
    },

    validate: function() {
      var d = new $.Deferred();
      
      this.errors = [];
      this.valid = true;
      this.validating = true;
      
      if (this.validateFrequency) this.element.addClass('validating');
      
      var value = this.getValue();

      if (!this.required && value.empty()) {
        this.setState('valid');
        
        d.resolve();
        
        return d;
      }
      
      if (this.required && value.empty()) {
        this.addError({ message: 'Required' });
      
        this.setState('invalid');
      
        d.resolve();
      
        return d;
      }
      
      if (this.validators.length == 0) {
        this.setState('valid');
        
        d.resolve();
        
        return d;
      }
      
      var base = this;
      
      $.when
        .apply(this, this.validators.map(function(v) { return v.validate(base); }))
        .then(function() {        
          var failedValidations = base.validators.filter(function(v) { return !v.valid; });
  
          failedValidations.forEach(function(validator) {
             if (validator.replacement) {
              base.valid = true;
              base.replaced = true;
              base.val(validator.replacement);
            }
            else {
              base.valid = false;
            
              if (validator.error) { 
                base.addError(validator.error);
              }
            }
          });
            
          base.setState(base.valid ? 'valid' : 'invalid');
     
          if (base.replaced) {
            base.replaced = false;
            
            base.validate().then(d.resolve);
          } 
          else {
            d.resolve();
          }
        });
      
      return d;
    },

    addError: function(error) {
      this.errors.push(error);
    },

    setState: function(state) {
      var base = this;
      this.validated = true;
      this.validating = false;
      
      if (state === 'valid') {
        this.valid = true;
        
        this.element.trigger('valid', this);
        
        if (this.validateFrequency) {
          setTimeout(function() { 
            base.element.removeClass('validating invalid').addClass('valid');
          }, this.validateFrequency);
        }
        else {
          this.element.removeClass('validating invalid').addClass('valid');
        }
      } 
      else if (state === 'invalid') {
        this.valid = false;

        if (this.errors.length > 0) {
          this.messageEl.html(this.errors[0].message);
        }

        this.element.trigger('invalid', this);
      
        if (this.validateFrequency) {
          setTimeout(function() {
            base.element.removeClass('validating valid').addClass('invalid');
          }, this.validateFrequency);
        } 
        else {
          this.element.removeClass('validating valid').addClass('invalid');
        }
      }

      this.element.trigger('validated', this);
    }
  });

  Carbon.WISWIGInput = new Class({
    constructor: function(element) {
      this.element = $(element);
      this.required = false;
      this.type = 'textarea';
      this.sameAs = null;
      
      if (this.element.attr('minlength')) this.minLength = 0;
      if (this.element.attr('maxlength')) this.maxLength = 100000;      
    },

    focus: function() {
      this.element.focus();
    },
    
    select: function() {
      this.element.select();
    },

    getValue: function() {
      return this.element.html();
    },

    setValue: function(value) {
      this.element.html(value);
    }
  });

  var HtmlSelect = new Class({
    constructor: function(element) {
      this.element = $(element);
      this.required = this.element.attr('required');
      this.type = this.element.attr('type');
      this.supportsChange = true;
    },

    isActive: function() { return false; },

    getSelection: function() { return [ 0, 0] },

    getValue: function() {
      return this.element.find('option:selected').text();
    }
  });

  Carbon.HtmlCheckbox = new Class({
    constructor: function(element) {
      this.element = $(element);
      this.required = this.element.attr('required');
      this.type = 'checkbox';
      this.supportsChange = true;
    },

    getValue: function() {
      return this.element.val();
    }
  });

  Carbon.HtmlInput = new Class({
    constructor: function(element) {
      this.element  = $(element);

      this.name         = this.element.attr('name');
      this.required     = this.element.attr('required');
      this.type         = this.element.attr('type');
      this.sameAs       = this.element.attr('sameas');
      this.autoCorrect  = this.element.attr('autocorrect');

      this.data              = this.element.data();

      this.restrict          = this.data.restrict;
      this.validateRemote    = this.data.validateRemote;
      this.validateFrequency = this.data.validateFrequency;
        
      if (this.data.expand == 'auto') {
        new Carbon.AutoExpander(this.element);
      }
      
      if (this.element.attr('minlength')) {
        this.minLength = parseInt(this.element.attr('minlength'));
      }
      
      if (this.element.attr('maxlength')) {
        this.maxLength = parseInt(this.element.attr('maxlength'));
      }
    },

    isActive: function() {
      return document.activeElement == this.element[0];
    },

    getSelection: function() {
      var start = this.element.prop('selectionStart');
      var end = this.element.prop('selectionEnd');

      if(start == undefined || end == undefined) {
        // TODO: ie fallbacks (document.selection + selection.createRange)
      }
      
      return [ start, end ];
    },

    focus: function() {
      this.element.focus();
    },
    
    select: function() {
      this.element.select();  
    },

    getValue: function() {
      return this.element.val();
    },

    setValue: function(value) {
      this.element.val(value);

      this.element.trigger('change');
    }
  });

  var RequiredValidator = new Class({
    validate: function(field) {
      var d = new $.Deferred();
      var value = field.val();
      this.valid = !value.empty();
      
      if (!this.valid) {
        this.error = { message: 'Required' };
      }
      
      d.resolve();
      
      return d;
    }
  });

  var StringLengthValidator = new Class({
    constructor: function(minLength, maxLength) {
      this.minLength = minLength;
      this.maxLength = maxLength;
    },

    validate: function(field) {
      var d = new $.Deferred();
      
      var value = field.val();
      
      this.valid = value.length >= this.minLength && value.length <= this.maxLength;
      
      if (!this.valid) {
        if (value.length < this.minLength) {
          this.error = { message: "Must be at least " + this.minLength + " characters." };
        } 
        else {
          this.error = { message: "Must be fewer than " + this.maxLength + " characters." };
        }
      }
      
      d.resolve();
      
      return d;
    }
  });

  var PatternValidator = new Class({
    validate: function(field) {
      var d, value;
      d = new $.Deferred();
      value = field.val();
      this.valid = value === true;
      
      // TODO: Regex

      if (!this.valid) {
        this.error = { message: "Not valid" };
      }
      
      d.resolve();
      
      return d;
    }
  });

 var UrlValidator = new Class({
    constructor: function(autoCorrect) {
      this.autoCorrect = autoCorrect;
    },

    validate: function(field) {
      var d = new $.Deferred();
      var value = field.val();
      
      var autoCorrected = false;
       
      if (this.autoCorrect && !value.contains('://')) {
        value = 'http://' + value;

        autoCorrected = true;
      }

      var regex = /^(?:(?:https?):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/i;

      this.valid = regex.test(value);

      if (this.valid && this.autoCorrected) {
        field.setValue(value);
      }
      
      if (!this.valid) {
        this.error = { message: 'Not a valid url.' };
      }
      
      d.resolve();
      
      return d;
    }
  });

  var EmailAddressValidator = new Class({
    validate: function(field) {
      var d = new $.Deferred();
      var value = field.val();
      
      this.valid = /^[a-zA-Z0-9_\.\-\+]+\@([a-zA-Z0-9\-]+\.)+[a-zA-Z0-9]{2,4}$/.test(value);
      
      if (!this.valid) {
        this.error = { message: 'Not a valid email address.' };
      }
      
      d.resolve();
      
      return d;
    }
  });

  var CreditCardNumberValidator = new Class({
    validate: function(field) {
      var d = new $.Deferred();
      var value = field.val();
      this.valid = Carbon.CreditCard.validate(value);
      
      if (!this.valid) {
        this.error = { message: "Not a valid credit card number." };
      }
      
      d.resolve();
      
      return d;
    }
  });

  var RemoteValidator = new Class({
    constructor: function(url) {
      this.url = url;
    },

    validate: function(field) {
      var d = new $.Deferred();
      
      var value = field.val();
      
      this.valid = true;
      
      // Make sure we only have one request in flight
      if(this.request && this.request.readyState != 4) {
        this.request.abort();  
      }
      
      this.request = $.post(this.url, { value: value }); 
      
      this.request.done(function(data) {
        this.valid       = data.valid;
        this.error       = data.error;
        this.replacement = data.replacement;
        
        d.resolve();
      }.bind(this));
      
      this.request.fail(function(xhr) { d.fail(); });
      
      return d;
    }
  });

  // TODO: Suggestion Store
  // Check twitter's Typeahead

  Carbon.AutoComplete = new Class({
    constructor: function(element, options) {
      this.element = $(element);
      this.options = options || { };

      if(this.element.length == 0)  throw new Error("AutoComplete element not found");

      this.listEl = this.options.listEl || this.element.find('.suggestions:first');

      // Pluck the suggest options from the list element
      if (!options) {
        this.options = this.listEl.data();
      }
          
      this.template  = new Carbon.Template(this.options.template);
     
      this.remote    = this.options.remote;
      this.limit     = this.options.limit || 5;
      this.minLength = this.options.minLength || 1;
      
      this.ghostVal  = '';
      this.inputEl   = this.element.find('input').not('.ghost').first();
      this.ghost     = this.element.find('input.ghost');

      this.inputEl.attr('autocomplete', 'off');

      // Clear the ghost value
      if (this.ghost) {
        this.ghost.val('');
      }

      if (this.remote === undefined) { 
        throw new Error("AutoComplete remote is undefined for '" + element[0].id + "'.");
        
        return;
      }

      this.inputEl.on({
        keydown  : this.onKeyDown.bind(this),
        input    : this.onInput.bind(this),
        blur     : this.onBlur.bind(this)
      });
      
      // this.input.on('input', this.updateGhost.bind(this));
      this.listEl.on('click', 'li', this.liClicked.bind(this));

      var base = this;
      
      this.hoveringList = false;
      
      this.listEl.hover(
        function() { base.hoveringList = true;  },
        function() { base.hoveringList = false; }
      );
    },
    
    onBlur: function(e) {
      if(this.hoveringList) return;
              
      this.close();   
    },

    on: function(name, callback) {
      $(this.element).on(name, callback);
    },
    
    off: function(name) {
      $(this.element).off(name);
    },
    
    liClicked: function(e) {
      e.stopPropagation();

      var target = $(e.currentTarget);
      
      this.select(target);
    },
    
    onInput: function(e) {
      var code = e.which;

      if (code === 13 || code === 30 || code === 38 || code === 40) return;
      
      var val = this.inputEl.val();
      
      this.filter(val);
      
      this.updateGhost();
      
      if (val.length < this.minLength) {
        if (this.fetch) this.fetch.abort();
        
        this.showList([]);
      } 
      else {        
        this.fetchSuggestions(val);
      }
    },

    onKeyDown: function(e) {
      switch(e.which) {
        case 27 : this.escape(e);   break;
        case 9  : this.close();     break;
        case 13 : this.onEnter(e);  break;
        case 38 : this.up();        break;
        case 40 : this.down();      break;
      } 
    },

    escape: function(e) {
      e.stopPropagation();
      e.preventDefault();

      this.close();
    },

    cancel: function() {
      this.ghostVal = '';
      this.close();
    },

    close: function() {
      this.element.removeClass('suggesting');

      this.listEl.html('');
    },

    updateGhost: function() {
      var val = this.inputEl.val().toLowerCase();
                  
      if (!this.ghost) return;
      
      if (val.length == 0) {
        this.ghost.val('');
      }
      
      if (!this.ghostVal) return;
      
      if (!this.ghostVal.toLowerCase().startsWith(val)) {
        this.ghost.val('');
        
        return;
      }
      
      if (this.ghostVal.length > 0) {
        val = this.inputEl.val() + this.ghostVal.substring(val.length);
      }
      
      this.ghost.val(val);
    },
    
    up: function() {      
      var current = this.listEl.children('.selected').removeClass('selected');
      var next = current.prev();
      
      if (next.length == 0) next = this.listEl.children('li:last');
      
      this.highlight(next);
    },

    down: function() {      
      var current = this.listEl.children('.selected').removeClass('selected');
      var next = current.next();
      
      if (next.length == 0) next = this.listEl.children('li:first');
      
      this.highlight(next);
    },

    highlight: function(el) {
      el.addClass('selected').focus();
            
      this.inputEl.val(el.data('value'));
      this.ghost.val(el.data('value'));
    },

    onEnter: function(e) {      
      var current = this.listEl.children('.selected');
            
      if (current.length > 0) {
        e.preventDefault();
        
        this.select(current);
      }
    },

    select: function(li) {
      var value = $(li).data('value');

      this.inputEl.val(value);
      this.inputEl.focus();
      
      this.element.trigger({
        type   : 'selection',
        value  : value,
        target : li
      }, li);
      
      this.updateGhost();
      
      this.showList([]);
    },
    
    filter: function(val) {
      return;
      
      val = val.toLowerCase();
      
      this.listEl.children().each(function() {
        var el = $(this);
        var value = el.data('value');
        
        if(value && !value.toLowerCase().contains(val)) {
          el.remove();
        }
      });
    },
    
    fetchSuggestions: function() {
      if (this.timeout) {
        clearTimeout(this.timeout);
      }
            
      this.timeout = setTimeout(this._fetchSuggestions.bind(this), 200);   
    },
    
    showList: function(data) {
      var base = this;
      this.listEl.html('');
      
      this.fetch = null;
      
      var val = this.inputEl.val().toLowerCase();

      data.forEach(function(item, i) {
        item.val = base.inputEl.val();
        
        var el = base.template.render(item);

        var value = el.data('value');
        
        if(i == 0) {
          base.ghostVal = value;
        }

        if((i + 1) <= base.limit) {
          if(value.toLowerCase().contains(val)) {
            el.appendTo(base.listEl);
          }
        }
      });
            
      if(this.listEl.children().length == 0) {
        this.ghostVal = '';
        this.element.removeClass('suggesting');
      }
      else {
        base.element.addClass('suggesting');
      }
      
      this.updateGhost();
    },

    _fetchSuggestions: function() {
      this.timeout = null;
       
      if (this.fetch) this.fetch.abort();
      
      var prefix = '?';
      
      if (this.options.remote.contains('?')) prefix = '&';
      
      var val = this.inputEl.val();
      
      if (val.length < this.minLength) { return; }
      
      var url = "" + this.options.remote + prefix + 'q=' + val;

      this.fetch = $.get(url);
      
      this.fetch.done(this.showList.bind(this));
      
      return this.fetch;
    }
  });

  // AutoExpand behavior for textareas
  Carbon.AutoExpander = new Class({
    constructor: function(element) {
      var textarea = $(element);

      this.diff = 0; // TODO padding

      var populated = (textarea.val().replace(/\s/g, '').length > 0);

      this.textarea = textarea;

      if (populated) {
        this.update();
      }

      this.textarea.on({
        keyup : this.onKeyUp.bind(this),
        poke  : this.poked.bind(this)
      });

      this.maxHeight = 10000;

      this.textarea.on('scroll change', this.update.bind(this));

      this.height = 0;
    },

    poked: function() {
      this.update();
    },

    onKeyUp: function(e) {
      var val = this.textarea.val();

      if (e.keyCode == 13 && !e.shiftKey) { // new line
        if (val.replace(/\s/g, '').length == 0) {          
          e.stopPropagation();
        }
      }

      this.update();
    },

    update: function() {
      var outerEl = this.textarea.closest('.outer');

      if(outerEl.length > 0) {
        outerEl.height(this.height);
      }

      this.textarea.height(0);
      
      var scrollHeight = this.textarea[0].scrollHeight;

      this.height = scrollHeight - this.diff;

      this.textarea.height(this.height);

      if(outerEl.length > 0) {
        outerEl.height(this.height);
      }

      this.textarea.trigger('expanded');
    }
  });

  var InputRestriction = {
    Number: function(e) { return !KeyEvent.isNumber(e); }
  };

  var KeyEvent = { 
    isCommand: function(e) {
      if (e.metaKey) return true;

      switch(e.which) {
        case 8  : return true; // backspace
        case 48 : return true; // delete
      }


      return false;
    },

    isNumber: function(e) {
      if(KeyEvent.isCommand(e)) return true;

      var char = String.fromCharCode(e.which);

      return !!/[\d\s]/.test(char);
    }
  };

  // Scope to Carbon to avoid conflict with braintree.js
  Carbon.CreditCard = {
    Types: {
      Visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
      MasterCard: /^5[1-5][0-9]{14}$/,
      // DinersClub: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
      Amex: /^3[47][0-9]{13}$/,
      Discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/
    },
    
    validate: function(number) {
      number = Carbon.CreditCard.strip(number);
      
      return !!Carbon.CreditCard.getType(number) && Carbon.CreditCard.verifyLuhn10(number);
    },
    
    getLuhn10: function(number) {
      var revArr = number.split('').reverse(); // Reverse the string & split on the characters
      
      var total = 0;
      var tmp = 0;
  
      // Add up the numbers    
      for(var i = 0; i < revArr.length; i++) {
        if((i % 2) > 0){
          tmp = revArr[i] * 2;
          tmp = (tmp < 9 ? tmp : (tmp - 9));
          total += tmp;
        }
        else {
          total += Number(revArr[i]);
        }
      }
      
      return total;
    },
    
    verifyLuhn10: function(number) {  
      return Carbon.CreditCard.getLuhn10(number) % 10 == 0;
    },
    
    strip: function(number) {   
      return number.replace(/-/g,"").replace(/ /g,"");
    },
    
    getType: function(number) {
      for (var type in Carbon.CreditCard.Types) {
        var regex = Carbon.CreditCard.Types[type];

        if (regex.test(number)) return type;
      }

      return null;
    }
  };

  Carbon.TokenList = new Class({
    statics: { 
      get: function(el) {
        return $(el).data('controller') || new Carbon.TokenList(el);
      } 
    },

    constructor: function(element) {
      this.element = $(element);
      this.fieldEl = this.element.find('.field');

      if (this.element.data('controller')) {
        throw new Error('TokenList is already setup');

        return;
      }

      if (this.fieldEl.data('remote')) {
        this.autoComplete = new Carbon.AutoComplete(this.fieldEl);

        this.autoComplete.on('selection', this.onSelection.bind(this));
      }

      this.inputEl = this.fieldEl.find('input');
      this.listEl  = this.element.find('ul');

      this.inputEl.on({ 
        keydown : this.onKeyDown.bind(this),
        blur    : this.onBlur.bind(this),
        input   : this.onInput.bind(this)
      });

      if (this.element.data('sortable')) {
        this.listEl.sortable({
          scroll    : false,
          distance  : 5
        });
      }

      // Set the default width of the input to 1char
      this.inputEl.width(this.measureText('a'));

      this.element.on('click', this.clicked.bind(this));

      this.element.on('click', 'li:not(.field)', this.clickedLi.bind(this));

      var isEmpty = this.count() == 0;

      this.element[(isEmpty ? 'add' : 'remove') + 'Class']('empty');

      this.element.data('controller', this);
    },

    on: function(name, callback) {
      $(this.element).on(name, callback);
    },
    
    off: function(name) {
      $(this.element).off(name);
    },

    getValues: function() {
      return this.listEl.find('li:not(.field)')
        .toArray()
        .map(function(el) { return $(el).find('.text').text() });
    },

    clickedLi: function(e) {
      var el = $(e.target).closest('li');

      // Default behavior is to remove

      this.remove(el);
    },

    clicked: function(e) {
      var target = $(e.target);

      if(target.closest('li').length > 0) return;

      e.stopPropagation();

      this.inputEl.select();
    },

    onSelection: function(e) { 
      this.inputEl.val('');
      this.add(e.value);
    },

    onBlur: function() {
      this.addCurrent();
    },

    addCurrent: function() {
      var value = this.inputEl.val().trim();

      if(value.length == 0) return false;

      var dubCount = this.getValues().filter(function(text) { 
        return text == value 
      }).length;

      if (dubCount > 0) {
        this.inputEl.addClass('dub');

        return;
      }

      this.inputEl.removeClass('dub');

      this.inputEl.val('');

      this.inputEl.width(this.measureText('a'));

      this.add(value);
    },

    onKeyDown: function(e) {
      if(e.which == 13 || e.which == 188) { // return & comma
        e.preventDefault();
        
        this.addCurrent();

        return false;
      }

      if(e.which == 8) { // backspace 
        if(this.inputEl.val().length == 0) { 
          this.remove(this.listEl.find('li:not(.field)').last());
        }
      }
    },

    onInput: function() {
      this.inputEl.removeClass('dub');

      var width = this.measureText(this.inputEl.val());

      if (this.inputEl.val().length > 0) {
        this.element.removeClass('empty');
      }
      else if (this.count() == 0) {
        this.element.addClass('empty');
      }

      this.inputEl.width(width);
    },

    measureText: function(text) {
      if (!this.tempEl) {
        this.tempEl = $('<span />').css({
          position  : 'fixed',
          left      : '-5000px',
          top       : '-5000px',

          fontFamily : this.inputEl.css('font-family'),
          fontSize   : this.inputEl.css('font-size'),
          fontWeight : this.inputEl.css('font-weight'),

          padding    : this.inputEl.css('padding'),
          margin     : this.inputEl.css('margin'),


          whiteSpace: 'pre',
          visiblity : 'hidden'
        });
        
        this.tempEl.appendTo('body');
      }
      
      this.tempEl.text(text);
      
      var width = this.tempEl.width() + 4;

      return width;
    },

    add: function(value) {
      if(value.length == 0) return;

      var liEl = new $('<li />');

      $('<span />').addClass('text').text(value).appendTo(liEl);
      //  $('<span />').addClass('remove').appendTo(liEl);

      var fieldEl = this.listEl.find('.field');

      if(fieldEl.length > 0) {
        liEl.insertBefore(fieldEl);
      }
      else {
        liEl.appendTo(this.listEl);
      }

      if(this.autoComplete) {
        this.autoComplete.cancel();
      }

      this.element.removeClass('empty');

      this.element.triggerHandler({ 
        type    : 'added',
        text    : value,
        element : liEl
      });

      this.element.trigger('modified');
    },

    count: function() {
      return this.listEl.find('li:not(.field)').length;
    },

    remove: function(el) {
      var text = el.find('.text').text();

      el.remove();

      if (this.count() == 0) {
        this.element.addClass('empty');

        this.inputEl.select();
      }

      this.element.triggerHandler({ 
        type : 'removed',
        text : text
      });

      this.element.trigger('modified');
    },

    dispose: function() {
      this.element.removeData('controller');

      this.element.off();

      if (this.tempEl) {
        this.tempEl.remove();
      }

      // TODO: Dispose autoComplete
    }
  });  
}).call(this);


$.fn.editBlock = function(options) {
  this.each(function() { return new Carbon.EditBlock(this, options); });
  
  return this;
};

$.fn.field = function(options) {
  this.each(function() { return new Carbon.Field(this, options); });
  
  return this;
};

$.fn.autoComplete = function(options) {
  this.each(function() { return new Carbon.AutoComplete(this, options); });
  
  return this;
};