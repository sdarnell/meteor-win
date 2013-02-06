
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

Shark._currentBuild = Shark._makeSpecial(null); // type: BuildState
Shark._currentBranch = Shark._makeSpecial(null); // type: Branch

Shark.BuildState = function (branch) {
  this.branch = branch ; // Branch
  this.newChildren = new OrderedDict();
  this.placeholders = {}; // comment string -> label
};

_.extend(
  Shark.BuildState.prototype,
  {
    newPlaceholder: function (label) {
      // make placeholder human-readable but not easily "forgeable"
      // by other HTML that may be present.
      // we don't have to parse it, only look it up.
      var placeholder = "Spark_Branch:" + label + ":" +
            Meteor.uuid().replace(/-/g, '');
      this.placeholders[placeholder] = label;
      return placeholder;
    },

    replacePlaceholders: function (root) {
      if (root.nodeType === 8) { // COMMENT
        var comment = root.nodeValue;
        if (this.placeholders.hasOwnProperty(comment)) {
          var child = this.newChildren.get(this.placeholders[comment]);
          if (child) {
            // replace comment with newly built Branch's fragment
            var frag = child.firstNode.parentNode;
            root.parentNode.replaceChild(frag, root);
          }
        }
      }
      if (root.firstChild) {
        for(var n = root.firstChild, next; n; n = next) {
          next = n.nextSibling;
          this.replacePlaceholders(n);
        }
      }
    }
  });


Shark.build = function (fn, controllerClass) {
  var b = new (controllerClass || Shark.Branch)();
  Shark.rebuild(b, fn);

  if (controllerClass)
    return b;
  else
    return b.firstNode.parentNode; // DocumentFragment
};

Shark.rebuild = function (branch, fn) {
  var state = new Shark.BuildState(branch);

  var html = Shark._currentBuild.withValue(state, function () {
    return Shark._currentBranch.withValue(branch, function () {
      return fn();
    });
  });

  var frag = DomUtils.htmlToFragment(html);

  if (! branch.firstNode) {
    // branch's first build

    if (! frag.firstChild)
      // give frag a child we can point to (comment node)
      frag.appendChild(document.createComment(""));

    state.replacePlaceholders(frag);

    branch.firstNode = frag.firstChild;
    branch.lastNode = frag.lastChild;
    branch.children = state.newChildren; // overwrite old dict
  } else {
    // XXX the real rebuild case
  }
};

Shark.branch = function (label, fn, controllerClass) {
  var state = Shark._currentBuild.get();

  if (state) {
    // we're making DOM, either building a new branch
    // or rebuilding an existing one.
    var parentBranch = state.branch;
    var newChildren = state.newChildren;

    if (newChildren.has(label))
      throw new Error("Duplicate branch label: " + label);

    var child = parentBranch.children.get(label);
    if (child) {
      // Rebuild existing child.
      //
      // ignore controllerClass argument; can't change the
      // controllerClass of an existing branch.

      // XXX may be time to check that child is in the DOM
      Shark.rebuild(child, fn);
    } else {
      // build new child
      child = Shark.build(fn, controllerClass || Shark.Branch);
    }

    newChildren.putBefore(label, child, null); // append

    return "<!--" + state.newPlaceholder(label) + "-->";

  } else {
    // generate HTML, for a direct template call or
    // server-side rendering.  We still construct the Branch
    // hierarchy and set currentBranch, but we are always building
    // the tree for the first time and things are much simpler.
    var child = new (controllerClass || Shark.Branch)();
    var currentBranch = Shark._currentBranch.get();
    if (currentBranch)
      currentBranch.children.putBefore(label, child, null); // append
    return Shark._currentBranch.withValue(child, function () {
      return fn();
    });
  }
};


var X = Shark.build(function () { return "<span>Hello!</span>"; });
var Y = Shark.build(function () { return "<span>" + Shark.branch('lalala', function () { return "Hello!"; }) + "</span>"; });
var str = (function () { return "<span>" + Shark.branch('lalala', function () { return "Hello!"; }) + "</span>"; })();