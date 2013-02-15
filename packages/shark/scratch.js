
  Shark.Branch.prototype.containsNode = function (node) {
    if (! (this.firstNode && this.lastNode))
      return false;

    for (var n = this.firstNode, tooFar = this.lastNode.nextSibling;
         n && n !== tooFar;
         n = n.nextSibling)
      if (n === node || DomUtils.nodeContains(n, node))
        return true;

    return false;
  };

  // returns label for a child Branch
  Shark.Branch.prototype.findChild = function (child) {
    var label = null;
    this.children.forEach(function (v, k) {
      if (v === child) {
        label = k;
        return OrderedDict.BREAK;
      }
    });
    return label;
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

Shark.findBranch = function (node) {
  while (node && ! node._Spark_Branch)
    node = node.parentNode;

  return node && node._Spark_Branch || null;
};

Shark.rebuild = function (branch, fn) {
  var state = new Shark.BuildState(branch);

  // is the focused element in one of our child branches?
  // if so, determine the branch, as a hint to patching.
  var focusBranch = document.activeElement &&
        Shark.findBranch(document.activeElement);
  while (focusBranch && focusBranch.parent !== branch)
    focusBranch = focusBranch.parent;
  // If focusBranch comes out truthy, it must be one of our
  // children.  Determine its label.
  var focusBranchLabel = focusBranch ?
        branch.findChild(focusBranch) : null;

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
      child.parent = branch;
    });

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
                                 commentDict, focusBranchLabel);
    branch.firstNode = newBounds[0];
    branch.lastNode = newBounds[1];

    // XXX use Spark.edit
  }

  // spray '_Spark_Branch' property to nodes that don't have it, to
  // mark innermost Branch containing a node.
  for (var n = branch.firstNode, tooFar = branch.lastNode.nextSibling;
       n && n !== tooFar;
       n = n.nextSibling)
    n._Spark_Branch = (n._Spark_Branch || branch);
};

Shark.branch = function (label, fn, controllerClass) {
  if (! label || (typeof label) !== "string")
    throw new Error("Spark.branch requires a non-empty string label.");

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
    if (currentBranch) {
      currentBranch.children.append(label, child);
      child.parent = currentBranch;
    }
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
                         oldChildren, newChildren, commentDict,
                         focusBranchLabel) {

  // There are four types of child Branches we might encounter:
  //
  // - dead -- label is only in oldChildren
  // - novel -- label is only in newChildren / commentDict
  // - rebuilt/unmoved -- label in both; Branch was rebuilt in place;
  //       we are able to leave it in the DOM in place and not
  //       move or reparent it.
  // - rebuilt/moved -- label in both; Branch was rebuilt in place;
  //       the DOM nodes must be moved
  //
  // We will have to move some rebuilt branches if their order changes
  // between old and new, or if the names of their enclosing tags
  // change, or if two rebuilt branches come to share a different
  // number of ancestors (e.g. they were in the same DIV, and now they
  // are in different DIVs).


  var unmovedChildLabel = null;
  // if the branch containing the focused DOM element can be considered
  // "rebuilt/unmoved", do it.
  if (focusBranchLabel &&
      oldChildren.has(focusBranchLabel) &&
      commentDict.has(focusBranchLabel) &&
      Shark._compareRelationships(oldBranch.firstNode.parentNode,
                                  oldChildren.get(focusBranchLabel).firstNode.parentNode,
                                  newFrag,
                                  commentDict.get(focusBranchLabel))) {
    unmovedChildLabel = focusBranchLabel;
  }

  // XXXXXXXXXXXXXXXXXXX
  //
  // - find all unmoved branches using _compareRelationships
  // - move stuff around / patch stuff up

  // XXX be sure to set parent pointers
};

Shark._commonAncestor = function (a, b) {
  if (a === b)
    return a;

  var x = a;
  while (x && ! (DomUtils.nodeContains(x, b) || x === b));
    x = x.parentNode;

  return x || null;
};

// For any nodes A and B in the same tree with nearest common ancestor X,
// relationship(A, B) is defined as the depth of A below X (an integer)
// followed by the chain of tag names under X including B
// (a possibly empty list of strings).  For example, if the relationship
// is [3, "DIV", "SPAN"], that means you can get from A to B by going
// up the tree three times, then down to a "DIV", then down to a "SPAN".
//
// This function tests whether relationship(from1, to1) is equal to
// relationship(from2, to2).
Shark._compareRelationships = function (from1, to1, from2, to2) {

  var commonAncestor1 = Shark._commonAncestor(from1, to1);
  var commonAncestor2 = Shark._commonAncestor(from2, to2);

  // With pointers x/y walking from from1/2 up to commonAncestor1/2,
  // see if one hits before the other.
  for(var x = from1, y = from2;
      x !== commonAncestor1 || y !== commonAncestor2;
      x = x.parentNode, y = y.parentNode)
    if (x === commonAncestor1 || y === commonAncestor2)
      return false;

  // With pointers x/y walking from to1/2 up to commonAncestor1/2,
  // see if they traverse nodes with the same tagNames.
  for(var x = to1, y = to2;
      x !== commonAncestor1 || y !== commonAncestor2;
      x = x.parentNode, y = y.parentNode) {
    if (x === commonAncestor1 || y === commonAncestor2)
      return false;
    if (x.tagName !== y.tagName)
      return false;
  }

  return true;
};


var X = Shark.build(function () { return "<span>Hello!</span>"; });
var Y = Shark.build(function () { return "<span>" + Shark.branch('lalala', function () { return "Hello!"; }) + "</span>"; });
var str = (function () { return "<span>" + Shark.branch('lalala', function () { return "Hello!"; }) + "</span>"; })();
