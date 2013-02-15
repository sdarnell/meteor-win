
(function() {

  Shark = {};

  // "Crockford's object()" function which creates a new object whose
  // prototype pointer points to an old object `o`.
  // http://javascript.crockford.com/prototypal.html
  var ctor = function () {};
  var object = function (o) {
    ctor.prototype = o;
    return new ctor();
  };

  // We get this pattern from Backbone.
  // See also js-toolbox:
  // https://github.com/jimmydo/js-toolbox/blob/master/toolbox.js
  var createSubclass = function (parentClass, protoProps, staticProps) {
    var newClass;

    // Since a "class" is just a constructor function, set newClass
    // to protoProps.constructor if it exists, or make up a constructor
    // that calls parentClass.apply(this, arguments).
    //
    // Custom constructors are expected to apply the parent constructor
    // by name:
    //
    //     MyClass = SomeClass.extend({
    //       constructor: function () {
    //         // ... do stuff ...
    //         // call parent constructor:
    //         SomeClass.apply(this, arguments);
    //         // ... do stuff...
    //       }
    //     });

    if (protoProps && protoProps.hasOwnProperty('constructor'))
      newClass = protoProps.constructor;
    else
      newClass = function () { return parentClass.apply(this, arguments); };

    // Inherit class (static) properties from parent.
    _.extend(newClass, parentClass);

    // Establish a prototype link from newClass.prototype to
    // parentClass.prototype.  This is similar to making
    // newClass.prototype a `new parentClass` but bypasses
    // the constructor.
    newClass.prototype = object(parentClass.prototype);

    // Add prototype properties (instance properties) to the new class,
    // if supplied.
    if (protoProps)
      _.extend(newClass.prototype, protoProps);

    // Add static properties to the constructor function, if supplied.
    if (staticProps)
      _.extend(newClass.prototype, staticProps);

    // Give instances a `constructor` property equal to `newClass`.
    newClass.prototype.constructor = newClass;

    return newClass;
  };

  // Assuming `this` is a class (i.e. a constructor function),
  // return a new class which is a subclass and supports `extend`.
  // This is the implementation of `extend`.
  var extendThis = function(protoProps, staticProps) {
    var subclass = createSubclass(this, protoProps, staticProps);
    subclass.extend = extendThis;
    return subclass;
  };

  Shark._makeSpecial = function (initialValue) {
    var current = initialValue;
    return {
      get: function () {
        return current;
      },
      withValue: function (v, func) {
        var previous = current;
        current = v;
        try { return func(); }
        finally { current = previous; }
      }
    };
  };

  var createThis = function (tag/*, args*/) {
    // XXX except don't create when updating!

    var constructor = this;
    // spread args into constructor
    var bind = Function.prototype.bind;
    var slice = Array.prototype.slice;
    // invoke `new constructor(...args)` via
    // `new (constructor.bind(null, ...args))`
    var branch = new (bind.apply(constructor, [null].concat(slice.call(arguments, 1))));
    branch.tag = (tag || '');

    return branch;
  };

  // Define Branch base class.
  var Branch = function () {
    this.tag = '';
    this.start = null;
    this.end = null;
    // A "built" Branch has DOM and start/end.  Branches are built on
    // the client when their DOM is needed.
    this.built = false;
    this.children = [];
  };
  Branch.extend = extendThis;
  Branch.create = createThis;
  Shark.Branch = Branch;

  _.extend(Shark.Branch.prototype, {
    // Returns HTML; overridden in subclasses.
    // All Branches have this so they can return initial HTML
    // (e.g. for server-side rendering).
    render: function () {
      throw new Error("Branch is abstract and has no implementation");
    },

    toHtml: function () {
      // return placeholder when called from a SmartBranch
      return this.render();
    },

    build: function () {
      if (this.built)
        return;

      var html = this.render();
      var frag = DomUtils.htmlToFragment(html);
      // make frag non-empty
      if (! frag.firstChild)
        frag.appendChild(document.createComment(""));

      this.start = frag.firstChild;
      this.end = frag.lastChild;
      this.built = true;

      // XXX
      // is it building that causes toHtml to return placeholders?
      // when is that necessary and what is the justification?
      // no, also updating.  Is it only SmartBranches where
      // placeholders make sense?
      // Maybe only in update?
    }
  });

  Shark.ListBranch = Shark.Branch.extend({
    constructor: function ListBranch(children) {
      Shark.Branch.call(this);

      // verify that children are Branches and add them
      // to this.children
      if (typeof children !== "object" ||
          typeof children.length !== 'number')
        throw new Error("ListBranch requires an Array of children");

      for(var i = 0; i < children.length; i++) {
        if (children[i] instanceof Shark.Branch)
          this.children.push(children[i]);
        else
          throw new Error(children[i] + " is not a Branch");
      }

    },
    render: function () {
      var buf = [];
      for(var i = 0; i < this.children.length; i++)
        buf.push(this.children[i].render());
      return buf.join();
    }
  });

  Shark.SmartBranch = Shark.Branch.extend({
    constructor: function SmartBranch(fn) {
      Shark.Branch.call(this);
      this.fn = fn;
    },
    render: function () {
      return this.fn();
    }
  });

})();
