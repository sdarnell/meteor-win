
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
  // XXX order of newChildren isn't actually used; we get order from where
  // things ended up in the DOM when building.
  this.newChildren = new OrderedDict(); // label -> Branch
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

    findPlaceholders: function (root, optDict) {
      // Walk the DOM from `root` and build an OrderedDict of
      // the placeholder comments that we recognize.

      // label -> comment node
      var dict = (optDict || new OrderedDict());

      if (root.nodeType === 8) { // COMMENT
        var commentValue = root.nodeValue;
        if (this.placeholders.hasOwnProperty(commentValue)) {
          var label = this.placeholders[commentValue];
          if (this.newChildren.has(label))
            dict.append(label, root);
        }
      }
      if (root.firstChild) {
        for(var n = root.firstChild, next; n; n = next) {
          next = n.nextSibling;
          this.findPlaceholders(n, dict);
        }
      }
      return dict;
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

  if (! frag.firstChild)
    // give frag a child we can point to (comment node)
    frag.appendChild(document.createComment(""));

  var newChildren = state.newChildren;
  var commentDict = state.findPlaceholders(frag);

  // commentDict has a subset of newChildren's keys, potentially
  // in a different order.

  if (! branch.firstNode) {
    // branch's first build
    commentDict.forEach(function (comment, label) {
      var child = newChildren.get(label);
      var frag = child.firstNode.parentNode;
      comment.parentNode.replaceChild(frag, comment);
      branch.children.append(label, child);
    });

    for (var n = frag.firstChild; n; n = n.nextSibling)
      n._Spark_Branch = (n._Spark_Branch || branch);

    branch.firstNode = frag.firstChild;
    branch.lastNode = frag.lastChild;
  } else {
    // We want to rebuild `branch.firstNode .. branch.lastNode`
    // to look like `frag` with placeholders replaced with
    // newChildren.  The new children whose labels matched old
    // children (`branch.children`) have already been rebuilt
    // in place, and we'd like to preserve them if possible.
    // The others have been built into DocumentFragments.

    var newBounds = Shark._patch(branch, frag,
                                 branch.children, state.newChildren,
                                 commentDict);
    branch.firstNode = newBounds[0];
    branch.lastNode = newBounds[1];

    // XXX use Spark.edit
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

    newChildren.append(label, child);

    return "<!--" + state.newPlaceholder(label) + "-->";

  } else {
    // generate HTML, for a direct template call or
    // server-side rendering.  We still construct the Branch
    // hierarchy and set currentBranch, but we are always building
    // the tree for the first time and things are much simpler.
    var child = new (controllerClass || Shark.Branch)();
    var currentBranch = Shark._currentBranch.get();
    if (currentBranch)
      currentBranch.children.append(label, child);
    return Shark._currentBranch.withValue(child, function () {
      return fn();
    });
  }
};

// Make the DOM between oldFirstNode and oldLastNode look like
// newFrag, if newFrag's placeholders were replaced with
// newChildren.  The new children who share labels with old children
// have already been rebuilt in place, and we'd like to leave them
// without reparenting them, if possible.
// `commentDict` provides look-up and traversal of the placeholder
// comment nodes, and actually provides the correct set of children
// and order.
Shark._patch = function (oldBranch, newFrag,
                         oldChildren, newChildren, commentDict) {

  // XXXXX

};


var X = Shark.build(function () { return "<span>Hello!</span>"; });
var Y = Shark.build(function () { return "<span>" + Shark.branch('lalala', function () { return "Hello!"; }) + "</span>"; });
var str = (function () { return "<span>" + Shark.branch('lalala', function () { return "Hello!"; }) + "</span>"; })();